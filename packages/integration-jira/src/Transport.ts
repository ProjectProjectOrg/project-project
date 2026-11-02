import { JiraError } from "@pp/shared"
import * as Context from "effect/Context"
import * as Effect from "effect/Effect"
import { FetchHttpClient, HttpClient, HttpClientRequest } from "effect/http"
import * as Layer from "effect/Layer"
import * as Predicate from "effect/Predicate"
import * as Schema from "effect/Schema"
import * as Stream from "effect/Stream"

const decodeUnknownJson = Schema.decodeEffect(
  Schema.fromJsonString(Schema.Json)
)

export type JiraTransportRequest = Readonly<{
  method: "GET" | "POST"
  url: string
  headers: Readonly<Record<string, string>>
  body?: Schema.Json
}>

export type JiraTransportResponse = Readonly<{
  status: number
  headers: Readonly<Record<string, string>>
  json: Effect.Effect<Schema.Json, JiraError>
  stream: Stream.Stream<Uint8Array, JiraError>
}>

export class JiraTransport extends Context.Service<
  JiraTransport,
  Readonly<{
    execute: (
      request: JiraTransportRequest
    ) => Effect.Effect<JiraTransportResponse, JiraError>
  }>
>()("@pp/integration-jira/Transport/JiraTransport") {}

const make = Effect.gen(function* () {
  const client = yield* HttpClient.HttpClient

  const execute = Effect.fn("JiraTransport.execute")(function* (
    input: JiraTransportRequest
  ) {
    let request =
      input.method === "POST"
        ? HttpClientRequest.post(input.url)
        : HttpClientRequest.get(input.url)
    request = HttpClientRequest.setHeaders(request, input.headers)
    if (input.body !== undefined) {
      request = HttpClientRequest.bodyJsonUnsafe(request, input.body)
    }
    const response = yield* client.execute(request).pipe(
      Effect.provideService(FetchHttpClient.RequestInit, {
        redirect: "manual"
      }),
      Effect.timeout("20 seconds"),
      Effect.mapError((error) =>
        Predicate.isTagged(error, "TimeoutError")
          ? new JiraError({ reason: "timeout" })
          : new JiraError({ reason: "network" })
      )
    )
    return {
      status: response.status,
      headers: response.headers,
      json: response.text.pipe(
        Effect.mapError(() => new JiraError({ reason: "network" })),
        Effect.flatMap((text) =>
          decodeUnknownJson(text).pipe(
            Effect.mapError(() => new JiraError({ reason: "invalid_response" }))
          )
        )
      ),
      stream: response.stream.pipe(
        Stream.mapError(() => new JiraError({ reason: "network" }))
      )
    }
  })

  return JiraTransport.of({ execute })
})

export const layer = Layer.effect(JiraTransport, make)
