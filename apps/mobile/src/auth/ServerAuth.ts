import { AppApi } from "@pp/shared"
import * as Clock from "effect/Clock"
import * as Context from "effect/Context"
import * as Data from "effect/Data"
import * as Duration from "effect/Duration"
import * as Effect from "effect/Effect"
import * as Layer from "effect/Layer"
import * as MutableHashSet from "effect/MutableHashSet"
import * as Option from "effect/Option"
import * as Predicate from "effect/Predicate"
import * as Semaphore from "effect/Semaphore"
import {
  HttpClient,
  HttpClientRequest,
  HttpClientResponse
} from "effect/unstable/http"
import { HttpApiClient } from "effect/unstable/httpapi"
import * as Reactivity from "effect/unstable/reactivity/Reactivity"

import { checkServer } from "@/onboarding/checkServer"
import { serverKeys } from "@/servers/keys"
import type { SavedServer, ServerTokens } from "@/servers/model"
import { ServerNotSaved, ServerStore } from "@/servers/ServerStore"

import {
  apiResource,
  appClientId,
  appRedirectUri,
  authorizationCode,
  authorizeUrl,
  TokenError,
  TokenResponse
} from "./oauth"
import { AuthBrowser, PkceSource } from "./ports"

export class SignInCancelled extends Data.TaggedError("SignInCancelled") {}

export class SignedOut extends Data.TaggedError("SignedOut")<
  Readonly<{ instanceId: string }>
> {}

export class InstanceChanged extends Data.TaggedError("InstanceChanged")<
  Readonly<{ instanceId: string }>
> {}

export class AuthUnavailable extends Data.TaggedError("AuthUnavailable")<
  Readonly<{ cause: unknown }>
> {}

export class TokenRejected extends Data.TaggedError("TokenRejected")<
  Readonly<{ error: string }>
> {}

export type SignInFailure = Effect.Error<
  ReturnType<(typeof ServerAuth.Service)["signIn"]>
>

export const refreshSkew = Duration.seconds(60)
export const authTimeout = Duration.seconds(15)

const decodeTokens = HttpClientResponse.schemaBodyJson(TokenResponse)
const decodeTokenError = HttpClientResponse.schemaBodyJson(TokenError)

export class ServerAuth extends Context.Service<ServerAuth>()(
  "@pp/mobile/auth/ServerAuth",
  {
    make: Effect.gen(function* () {
      const store = yield* ServerStore
      const http = yield* HttpClient.HttpClient
      const browser = yield* AuthBrowser
      const pkceSource = yield* PkceSource
      const reactivity = yield* Reactivity.Reactivity
      const refreshLock = yield* Semaphore.make(1)

      const forgetTokens = (instanceId: string) =>
        store
          .clearTokens(instanceId)
          .pipe(Effect.andThen(reactivity.invalidate(serverKeys.catalog())))
      const verified = MutableHashSet.empty<string>()

      const savedServer = (instanceId: string) =>
        store.list.pipe(
          Effect.map((servers) =>
            Option.fromUndefinedOr(
              servers.find((server) => server.instanceId === instanceId)
            )
          ),
          Effect.flatMap(
            Option.match({
              onNone: () => Effect.fail(new ServerNotSaved({ instanceId })),
              onSome: Effect.succeed
            })
          )
        )

      const verifyInstance = (server: SavedServer) =>
        checkServer(server.origin).pipe(
          Effect.provideService(HttpClient.HttpClient, http),
          Effect.filterOrFail(
            (checked) => checked.descriptor.instanceId === server.instanceId,
            () => new InstanceChanged({ instanceId: server.instanceId })
          ),
          Effect.andThen(
            Effect.sync(() => MutableHashSet.add(verified, server.instanceId))
          ),
          Effect.asVoid
        )

      const requestTokens = Effect.fn("requestTokens")(function* (
        origin: string,
        params: Readonly<Record<string, string>>
      ) {
        const response = yield* http
          .execute(
            HttpClientRequest.post(`${origin}/api/auth/oauth2/token`).pipe(
              HttpClientRequest.acceptJson,
              HttpClientRequest.bodyUrlParams({
                client_id: appClientId,
                resource: apiResource(origin),
                ...params
              })
            )
          )
          .pipe(
            Effect.timeout(authTimeout),
            Effect.mapError((cause) => new AuthUnavailable({ cause }))
          )
        if (response.status >= 400 && response.status < 500) {
          const rejection = yield* decodeTokenError(response).pipe(
            Effect.mapError((cause) => new AuthUnavailable({ cause }))
          )
          return yield* new TokenRejected({ error: rejection.error })
        }
        const body = yield* decodeTokens(response).pipe(
          Effect.mapError((cause) => new AuthUnavailable({ cause }))
        )
        const now = yield* Clock.currentTimeMillis
        return {
          accessToken: body.access_token,
          refreshToken: body.refresh_token,
          expiresAt: now + body.expires_in * 1000
        } satisfies ServerTokens
      })

      const refresh = (server: SavedServer, tokens: ServerTokens) =>
        requestTokens(server.origin, {
          grant_type: "refresh_token",
          refresh_token: tokens.refreshToken
        }).pipe(
          Effect.retry({
            times: 1,
            while: Predicate.isTagged("AuthUnavailable")
          }),
          Effect.tap((next) => store.attachTokens(server.instanceId, next)),
          Effect.catchTag("TokenRejected", () =>
            forgetTokens(server.instanceId).pipe(
              Effect.andThen(
                Effect.fail(new SignedOut({ instanceId: server.instanceId }))
              )
            )
          ),
          Effect.uninterruptible
        )

      const accessToken = Effect.fn("accessToken")(function* (
        instanceId: string
      ) {
        const server = yield* savedServer(instanceId)
        if (!MutableHashSet.has(verified, instanceId)) {
          yield* verifyInstance(server)
        }
        return yield* refreshLock.withPermits(1)(
          Effect.gen(function* () {
            const stored = yield* store.tokens(instanceId)
            if (Option.isNone(stored)) {
              return yield* new SignedOut({ instanceId })
            }
            const now = yield* Clock.currentTimeMillis
            if (stored.value.expiresAt - Duration.toMillis(refreshSkew) > now) {
              return stored.value.accessToken
            }
            const next = yield* refresh(server, stored.value)
            return next.accessToken
          })
        )
      })

      const clientFor = (server: SavedServer, token: string) =>
        HttpApiClient.make(AppApi, {
          baseUrl: `${server.origin}/api`,
          transformClient: (client) =>
            client.pipe(
              HttpClient.mapRequest(HttpClientRequest.bearerToken(token)),
              HttpClient.tap((response) =>
                response.status === 401
                  ? forgetTokens(server.instanceId).pipe(Effect.ignore)
                  : Effect.void
              )
            )
        }).pipe(Effect.provideService(HttpClient.HttpClient, http))

      const api = Effect.fn("api")(function* (instanceId: string) {
        const server = yield* savedServer(instanceId)
        const token = yield* accessToken(instanceId)
        return yield* clientFor(server, token)
      })

      const signIn = Effect.fn("signIn")(function* (instanceId: string) {
        const server = yield* savedServer(instanceId)
        yield* verifyInstance(server)
        const pkce = yield* pkceSource.create
        const callback = yield* browser
          .authorize(authorizeUrl(server.origin, pkce))
          .pipe(
            Effect.flatMap(
              Option.match({
                onNone: () => Effect.fail(new SignInCancelled()),
                onSome: Effect.succeed
              })
            )
          )
        const code = yield* Effect.fromResult(
          authorizationCode(callback, pkce.state)
        )
        const tokens = yield* requestTokens(server.origin, {
          grant_type: "authorization_code",
          code,
          code_verifier: pkce.verifier,
          redirect_uri: appRedirectUri
        })
        yield* store.attachTokens(instanceId, tokens)
        const client = yield* clientFor(server, tokens.accessToken)
        const [user, orgs] = yield* Effect.all(
          [client.auth.me(), client.org.myOrgs()],
          { concurrency: 2 }
        ).pipe(Effect.mapError((cause) => new AuthUnavailable({ cause })))
        yield* store.save({
          ...server,
          user: { id: user.id, name: user.name, email: user.email },
          orgs: orgs.map((org) => ({ slug: org.slug, name: org.name }))
        })
      })

      const signOut = Effect.fn("signOut")(function* (instanceId: string) {
        const server = yield* savedServer(instanceId)
        const stored = yield* store.tokens(instanceId)
        if (Option.isSome(stored)) {
          yield* http
            .execute(
              HttpClientRequest.post(
                `${server.origin}/api/auth/oauth2/revoke`
              ).pipe(
                HttpClientRequest.bodyUrlParams({
                  client_id: appClientId,
                  token: stored.value.refreshToken,
                  token_type_hint: "refresh_token"
                })
              )
            )
            .pipe(Effect.timeout(authTimeout), Effect.ignore)
        }
        yield* store.clearTokens(instanceId)
      })

      return { signIn, signOut, accessToken, api }
    })
  }
) {
  static readonly layer = Layer.effect(this, this.make)
}
