import { cliRelease, isReleaseTag } from "@pp/shared"
import * as Config from "effect/Config"
import * as Effect from "effect/Effect"
import { HttpClient, HttpRouter, HttpServerResponse } from "effect/http"
import * as Layer from "effect/Layer"
import * as Option from "effect/Option"

import { toolsResource } from "../auth"
import { findRelease, findTaggedRelease, installWrapper } from "./cliRelease"

const lookupFor = (build: string) =>
  isReleaseTag(build)
    ? Option.some(findTaggedRelease(build))
    : build.startsWith("sha-")
      ? Option.some(findRelease(build.slice(4)))
      : Option.none()

const quietly = <E>(
  lookup: Effect.Effect<Option.Option<string>, E, HttpClient.HttpClient>
) =>
  lookup.pipe(
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
    const release = yield* Option.match(lookupFor(build), {
      onNone: () => Effect.succeed(Effect.succeed(Option.none<string>())),
      onSome: (lookup) =>
        Effect.cachedWithTTL(
          quietly(lookup).pipe(
            Effect.provideService(HttpClient.HttpClient, client)
          ),
          "10 minutes"
        )
    })
    const origin = new URL(toolsResource).origin
    return Layer.mergeAll(
      HttpRouter.add(
        "GET",
        cliRelease.installScriptPath,
        Effect.map(release, (tag) =>
          HttpServerResponse.text(installWrapper(tag, origin), {
            contentType: "text/x-shellscript"
          })
        )
      ),
      HttpRouter.add(
        "GET",
        cliRelease.releasePath,
        Effect.map(release, (tag) =>
          HttpServerResponse.jsonUnsafe({ version: Option.getOrNull(tag) })
        )
      )
    )
  })
)
