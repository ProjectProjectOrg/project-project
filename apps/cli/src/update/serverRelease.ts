import { cliRelease, isReleaseTag, ServerCliRelease } from "@pp/shared"
import * as Effect from "effect/Effect"
import { HttpClient, HttpClientResponse } from "effect/http"
import * as Option from "effect/Option"

import { unreachable } from "../CliFailure"

export const serverRelease = (origin: string) =>
  Effect.gen(function* () {
    const client = yield* HttpClient.HttpClient
    const response = yield* client
      .get(`${origin}${cliRelease.releasePath}`)
      .pipe(Effect.flatMap(HttpClientResponse.filterStatusOk))
    const { version } =
      yield* HttpClientResponse.schemaBodyJson(ServerCliRelease)(response)
    if (version === null) return Option.none<string>()
    if (!isReleaseTag(version)) {
      return yield* unreachable(
        `${origin} named "${version}" as its pp version, which isn't a pp release. Try \`pp upgrade --latest\`.`
      )
    }
    return Option.some(version)
  }).pipe(
    Effect.catchTags({
      HttpClientError: () =>
        Effect.fail(
          unreachable(
            `Couldn't ask ${origin} which pp to install. Try \`pp upgrade --latest\`.`
          )
        ),
      SchemaError: () =>
        Effect.fail(
          unreachable(
            `${origin} didn't say which pp to install. Try \`pp upgrade --latest\`.`
          )
        )
    })
  )
