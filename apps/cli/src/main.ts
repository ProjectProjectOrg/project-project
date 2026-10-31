#!/usr/bin/env bun
import * as BunRuntime from "@effect/platform-bun/BunRuntime"
import * as BunServices from "@effect/platform-bun/BunServices"
import { Command } from "effect/cli"
import * as Console from "effect/Console"
import * as Effect from "effect/Effect"
import * as Exit from "effect/Exit"
import { FetchHttpClient } from "effect/http"
import * as Layer from "effect/Layer"
import * as Option from "effect/Option"

import { Browser } from "./auth/Browser"
import { Loopback } from "./auth/Loopback"
import { CliFailure, ExitCode } from "./CliFailure"
import { pp } from "./commands/tree"
import { framed } from "./output/frame"
import { reveal } from "./output/reveal"
import { welcomeLines } from "./output/splash"
import { muted, stderrTerminal, stdoutTerminal } from "./output/terminal"
import { ServerStore } from "./servers/ServerStore"
import {
  type Notice,
  noticeText,
  UpdateNotice,
  updateNoticeLayer
} from "./update/UpdateNotice"
import { buildVersion } from "./version"

const ServicesLive = Layer.mergeAll(
  ServerStore.layer,
  Loopback.layer,
  Browser.layer,
  FetchHttpClient.layer
).pipe(Layer.provideMerge(BunServices.layer))

const CliLive = updateNoticeLayer(buildVersion).pipe(
  Layer.provideMerge(ServicesLive)
)

const alreadyToldToUpgrade = <A>(exit: Exit.Exit<A, unknown>) =>
  Option.exists(
    Exit.findErrorOption(exit),
    (error) => error instanceof CliFailure && error.code === ExitCode.outdated
  )

const showNotice = (notice: Notice) => {
  const terminal = stderrTerminal()
  return terminal.fancy && (process.stderr.columns ?? 0) >= 80
    ? `\n${framed("update", [notice.fact, `${muted("►", terminal)} ${notice.action}`], terminal)}`
    : noticeText(notice)
}

const printNotice = Effect.flatMap(
  UpdateNotice,
  (updates) => updates.notice
).pipe(
  Effect.flatMap(
    Option.match({
      onNone: () => Effect.void,
      onSome: (notice) => Console.error(showNotice(notice))
    })
  )
)

const welcome = Effect.gen(function* () {
  const catalog = yield* (yield* ServerStore).list.pipe(
    Effect.orElseSucceed(() => ({ servers: [], defaultServer: null }))
  )
  const server =
    catalog.servers.find((saved) => saved.origin === catalog.defaultServer) ??
    catalog.servers[0]
  const terminal = stdoutTerminal()
  yield* reveal(
    welcomeLines(
      buildVersion,
      server === undefined
        ? undefined
        : { origin: server.origin, user: server.user.name },
      terminal
    ),
    terminal
  )
})

pp.pipe(
  Command.run({ version: buildVersion }),
  (cli) =>
    Effect.suspend(() =>
      process.argv.length <= 2 && stdoutTerminal().fancy
        ? Effect.andThen(welcome, Effect.void)
        : cli
    ),
  Effect.tapErrorTag("CliFailure", (failure) => Console.error(failure.message)),
  Effect.onExit((exit) =>
    alreadyToldToUpgrade(exit) ? Effect.void : printNotice
  ),
  Effect.provide(CliLive),
  BunRuntime.runMain
)
