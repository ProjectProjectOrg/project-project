import * as BunHttpServer from "@effect/platform-bun/BunHttpServer"
import * as Context from "effect/Context"
import * as Deferred from "effect/Deferred"
import * as Effect from "effect/Effect"
import { HttpServerRequest, HttpServerResponse } from "effect/http"
import * as Layer from "effect/Layer"
import * as Option from "effect/Option"
import type * as Scope from "effect/Scope"

import { CliFailure, ExitCode } from "../CliFailure"
import type { SignInPages } from "./discovery"

export type SignInOutcome =
  | Readonly<{ signedIn: true }>
  | Readonly<{ signedIn: false; reason: string }>

export type Listening = Readonly<{
  redirectUri: string
  redirect: Effect.Effect<URLSearchParams>
  finish: (outcome: SignInOutcome) => Effect.Effect<void>
}>

const page = (heading: string, detail: string) =>
  HttpServerResponse.html(
    `<!doctype html><meta charset="utf-8"><meta name="color-scheme" content="light dark"><title>PP CLI</title><body style="font-family:system-ui;margin:4rem auto;max-width:28rem;padding:0 1.5rem"><h1 style="font-size:1.25rem">${heading}</h1><p>${detail}</p></body>`
  )

export const responseFor = (
  outcome: SignInOutcome,
  pages: Option.Option<SignInPages>
) =>
  Option.match(pages, {
    onSome: (found) => {
      if (outcome.signedIn) return HttpServerResponse.redirect(found.signedIn)
      const failed = new URL(found.failed)
      failed.searchParams.set("reason", outcome.reason)
      return HttpServerResponse.redirect(failed.href)
    },
    onNone: () =>
      outcome.signedIn
        ? page(
            "You're signed in to PP CLI.",
            "You can close this tab and go back to your terminal."
          )
        : page(
            "Sign-in didn't finish.",
            "Go back to your terminal for details."
          )
  })

const cannotListen = () =>
  new CliFailure({
    message: "Couldn't open a local port for the sign-in redirect.",
    code: ExitCode.failure
  })

export class Loopback extends Context.Service<
  Loopback,
  Readonly<{
    listen: (
      pages: Option.Option<SignInPages>
    ) => Effect.Effect<Listening, CliFailure, Scope.Scope>
  }>
>()("@pp/cli/auth/Loopback") {
  static readonly layer = Layer.succeed(
    Loopback,
    Loopback.of({
      listen: (pages) =>
        Effect.gen(function* () {
          const server = yield* BunHttpServer.make({
            port: 0,
            hostname: "127.0.0.1"
          }).pipe(Effect.mapError(cannotListen))
          const received = yield* Deferred.make<URLSearchParams>()
          const outcome = yield* Deferred.make<SignInOutcome>()
          const answered = yield* Deferred.make<void>()
          yield* Effect.addFinalizer(() =>
            Deferred.succeed(outcome, {
              signedIn: false,
              reason: "interrupted"
            })
          )
          yield* server.serve(
            Effect.gen(function* () {
              const request = yield* HttpServerRequest.HttpServerRequest
              const url = new URL(request.url, "http://127.0.0.1")
              if (url.pathname !== "/callback") {
                return HttpServerResponse.empty({ status: 404 })
              }
              yield* Deferred.succeed(received, url.searchParams)
              const response = responseFor(
                yield* Deferred.await(outcome),
                pages
              )
              yield* Deferred.succeed(answered, undefined)
              return response
            })
          )
          const address = server.address
          if (address._tag === "UnixPathAddress") return yield* cannotListen()
          const listening: Listening = {
            redirectUri: `http://127.0.0.1:${address.port}/callback`,
            redirect: Deferred.await(received),
            finish: (result) =>
              Deferred.succeed(outcome, result).pipe(
                Effect.andThen(
                  Deferred.await(answered).pipe(
                    Effect.timeoutOrElse({
                      duration: "3 seconds",
                      orElse: () => Effect.void
                    })
                  )
                )
              )
          }
          return listening
        })
    })
  )
}
