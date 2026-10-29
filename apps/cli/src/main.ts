#!/usr/bin/env bun
import * as BunRuntime from "@effect/platform-bun/BunRuntime"
import * as BunServices from "@effect/platform-bun/BunServices"
import { Command } from "effect/cli"
import * as Console from "effect/Console"
import * as Effect from "effect/Effect"
import { FetchHttpClient } from "effect/http"
import * as Layer from "effect/Layer"

import { Browser } from "./auth/Browser"
import { Loopback } from "./auth/Loopback"
import { pp } from "./commands/tree"
import { ServerStore } from "./servers/ServerStore"
import { buildVersion } from "./version"

const CliLive = Layer.mergeAll(
  ServerStore.layer,
  Loopback.layer,
  Browser.layer,
  FetchHttpClient.layer
).pipe(Layer.provideMerge(BunServices.layer))

pp.pipe(
  Command.run({ version: buildVersion }),
  Effect.tapErrorTag("CliFailure", (failure) => Console.error(failure.message)),
  Effect.provide(CliLive),
  BunRuntime.runMain
)
