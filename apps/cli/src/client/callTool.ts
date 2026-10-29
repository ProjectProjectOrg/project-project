import {
  cliOAuthClient,
  cliRelease,
  ToolFailure,
  toolInputVersions,
  type ToolName
} from "@pp/shared"
import * as Effect from "effect/Effect"
import { HttpClient, HttpClientRequest, HttpClientResponse } from "effect/http"
import * as Schema from "effect/Schema"

import {
  CliFailure,
  ExitCode,
  exitCodeForError,
  notSignedIn,
  unreachable
} from "../CliFailure"
import { terminalText } from "../output/terminalText"
import type { SavedServer } from "../servers/ServerStore"
import { freshAccessToken } from "./Session"

const decodeFailure = HttpClientResponse.schemaBodyJson(ToolFailure)

const failureFrom = (
  server: SavedServer,
  response: HttpClientResponse.HttpClientResponse
) =>
  decodeFailure(response).pipe(
    Effect.map((failure) =>
      response.status === 401
        ? notSignedIn(
            terminalText(failure.message).replace(
              "`pp login`",
              `\`pp login ${server.origin}\``
            )
          )
        : new CliFailure({
            message: terminalText(failure.message),
            code: exitCodeForError(failure.error)
          })
    ),
    Effect.orElseSucceed(
      () =>
        new CliFailure({
          message: `${server.origin} answered with HTTP ${response.status}.`,
          code: ExitCode.failure
        })
    ),
    Effect.flatMap(Effect.fail)
  )

export const callTool = Effect.fn("callTool")(function* (
  server: SavedServer,
  name: ToolName,
  input: unknown
) {
  const accessToken = yield* freshAccessToken(server)
  const client = yield* HttpClient.HttpClient
  const response = yield* HttpClientRequest.post(
    `${server.origin}${cliOAuthClient.resourcePath}/${name}`
  ).pipe(
    HttpClientRequest.bearerToken(accessToken),
    HttpClientRequest.setHeader(
      cliRelease.toolVersionHeader,
      toolInputVersions[name]
    ),
    HttpClientRequest.bodyJson(input),
    Effect.flatMap(client.execute),
    Effect.mapError(() => unreachable(`Couldn't reach ${server.origin}.`))
  )
  if (response.status !== 200) return yield* failureFrom(server, response)
  return yield* response.json.pipe(
    Effect.mapError(() =>
      unreachable(`${server.origin} sent a response that isn't JSON.`)
    )
  )
})

export const callToolAs = <A, I>(
  server: SavedServer,
  name: ToolName,
  input: unknown,
  success: Schema.Codec<A, I>
) =>
  Effect.flatMap(callTool(server, name, input), (body) =>
    Schema.decodeUnknownEffect(success)(body).pipe(
      Effect.mapError(
        () =>
          new CliFailure({
            message: `${server.origin} sent an unexpected result for ${name}.`,
            code: ExitCode.failure
          })
      )
    )
  )
