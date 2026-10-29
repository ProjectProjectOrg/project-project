import { cliRelease } from "@pp/shared"
import * as Config from "effect/Config"
import * as Effect from "effect/Effect"
import { HttpClient, HttpRouter, HttpServerResponse } from "effect/http"
import * as Layer from "effect/Layer"
import * as Option from "effect/Option"

import { toolsResource } from "../auth"
import { findRelease, installWrapper } from "./cliRelease"

const commitOf = (build: string) =>
  build.startsWith("sha-") ? Option.some(build.slice(4)) : Option.none()

const lookupRelease = (commit: string) =>
  findRelease(commit).pipe(
    Effect.catch((error) =>
      Effect.as(
        Effect.logWarning("Couldn't look up this server's pp release", error),
        Option.none<string>()
      )
    )
  )

export const CliInstallRouteLive = Layer.unwrap(
  Effect.gen(function* () {
    const build = yield* Config.String("APP_VERSION").pipe(
      Config.withDefault("dev")
    )
    const client = yield* HttpClient.HttpClient
    const release = yield* Option.match(commitOf(build), {
      onNone: () => Effect.succeed(Effect.succeed(Option.none<string>())),
      onSome: (commit) =>
        Effect.cachedWithTTL(
          lookupRelease(commit).pipe(
            Effect.provideService(HttpClient.HttpClient, client)
          ),
          "10 minutes"
        )
    })
    const origin = new URL(toolsResource).origin
    return HttpRouter.add(
      "GET",
      cliRelease.installScriptPath,
      Effect.map(release, (tag) =>
        HttpServerResponse.text(installWrapper(tag, origin), {
          contentType: "text/x-shellscript"
        })
      )
    )
  })
)
