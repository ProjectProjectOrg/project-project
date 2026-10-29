import * as Effect from "effect/Effect"
import {
  HttpClient,
  type HttpClientRequest,
  HttpClientResponse
} from "effect/http"
import * as Layer from "effect/Layer"

export type Answer = (
  url: URL,
  request: HttpClientRequest.HttpClientRequest
) => Response

export const fakeHttp = (answer: Answer) =>
  Layer.succeed(
    HttpClient.HttpClient,
    HttpClient.make((request, url) =>
      Effect.succeed(HttpClientResponse.fromWeb(request, answer(url, request)))
    )
  )

const decoder = new TextDecoder()

export const formBody = (request: HttpClientRequest.HttpClientRequest) =>
  new URLSearchParams(
    request.body._tag === "Uint8Array" ? decoder.decode(request.body.body) : ""
  )

export const jsonBody = (
  request: HttpClientRequest.HttpClientRequest
): unknown =>
  request.body._tag === "Uint8Array"
    ? JSON.parse(decoder.decode(request.body.body))
    : {}
