import * as BunHttpServer from "@effect/platform-bun/BunHttpServer"
import * as Context from "effect/Context"
import * as Deferred from "effect/Deferred"
import * as Effect from "effect/Effect"
import { HttpServerRequest, HttpServerResponse } from "effect/http"
import * as Layer from "effect/Layer"
import type * as Scope from "effect/Scope"

import { CliFailure, ExitCode } from "../CliFailure"

export type Listening = Readonly<{
  redirectUri: string
  redirect: Effect.Effect<URLSearchParams>
}>

const page = (heading: string, detail: string) =>
  HttpServerResponse.html(
    `<!doctype html><meta charset="utf-8"><title>pp</title><body style="font-family:system-ui;margin:4rem auto;max-width:28rem"><h1 style="font-size:1.25rem">${heading}</h1><p>${detail}</p></body>`
  )

const cannotListen = () =>
  new CliFailure({
    message: "Couldn't open a local port for the sign-in redirect.",
    code: ExitCode.failure
  })

export class Loopback extends Context.Service<
  Loopback,
  Readonly<{ listen: Effect.Effect<Listening, CliFailure, Scope.Scope> }>
>()("@pp/cli/auth/Loopback") {
  static readonly layer = Layer.succeed(
    Loopback,
    Loopback.of({
      listen: Effect.gen(function* () {
        const server = yield* BunHttpServer.make({
          port: 0,
          hostname: "127.0.0.1"
        }).pipe(Effect.mapError(cannotListen))
        const received = yield* Deferred.make<URLSearchParams>()
        yield* server.serve(
          Effect.gen(function* () {
            const request = yield* HttpServerRequest.HttpServerRequest
            const url = new URL(request.url, "http://127.0.0.1")
            if (url.pathname !== "/callback") {
              return HttpServerResponse.empty({ status: 404 })
            }
            yield* Deferred.succeed(received, url.searchParams)
            return url.searchParams.has("code")
              ? page(
                  "You're signed in to pp.",
                  "You can close this tab and go back to your terminal."
                )
              : page(
                  "Sign-in didn't finish.",
                  "Go back to your terminal for details."
                )
          })
        )
        const address = server.address
        if (address._tag === "UnixPathAddress") return yield* cannotListen()
        const listening: Listening = {
          redirectUri: `http://127.0.0.1:${address.port}/callback`,
          redirect: Deferred.await(received)
        }
        return listening
      })
    })
  )
}
