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
import { ServerStore } from "./servers/ServerStore"
import { UpdateNotice, updateNoticeLayer } from "./update/UpdateNotice"
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

const printNotice = Effect.flatMap(
  UpdateNotice,
  (updates) => updates.notice
).pipe(
  Effect.flatMap(
    Option.match({ onNone: () => Effect.void, onSome: Console.error })
  )
)

pp.pipe(
  Command.run({ version: buildVersion }),
  Effect.tapErrorTag("CliFailure", (failure) => Console.error(failure.message)),
  Effect.onExit((exit) =>
    alreadyToldToUpgrade(exit) ? Effect.void : printNotice
  ),
  Effect.provide(CliLive),
  BunRuntime.runMain
)
