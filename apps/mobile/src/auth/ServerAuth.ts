import { AppApi } from "@pp/shared"
import * as Clock from "effect/Clock"
import * as Context from "effect/Context"
import * as Data from "effect/Data"
import * as Duration from "effect/Duration"
import * as Effect from "effect/Effect"
import * as Layer from "effect/Layer"
import * as MutableHashMap from "effect/MutableHashMap"
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
import type { OrgLocation, SavedServer, ServerTokens } from "@/servers/model"
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

const identity = (server: SavedServer) =>
  `${server.instanceId} ${server.origin}`

export class ServerAuth extends Context.Service<ServerAuth>()(
  "@pp/mobile/auth/ServerAuth",
  {
    make: Effect.gen(function* () {
      const store = yield* ServerStore
      const http = yield* HttpClient.HttpClient
      const browser = yield* AuthBrowser
      const pkceSource = yield* PkceSource
      const reactivity = yield* Reactivity.Reactivity
      const locks = MutableHashMap.empty<string, Semaphore.Semaphore>()
      const verified = MutableHashSet.empty<string>()

      const lockFor = (instanceId: string) =>
        Effect.sync(() =>
          Option.getOrElse(MutableHashMap.get(locks, instanceId), () => {
            const lock = Semaphore.makeUnsafe(1)
            MutableHashMap.set(locks, instanceId, lock)
            return lock
          })
        )

      const exclusively =
        (instanceId: string) =>
        <A, E, R>(effect: Effect.Effect<A, E, R>) =>
          Effect.flatMap(lockFor(instanceId), (lock) =>
            lock.withPermits(1)(effect)
          )

      const publish = (instanceId: string) =>
        reactivity.invalidate([
          ...serverKeys.catalog(),
          ...serverKeys.session(instanceId)
        ])

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
            Effect.sync(() => MutableHashSet.add(verified, identity(server)))
          ),
          Effect.asVoid
        )

      const ensureVerified = (server: SavedServer) =>
        MutableHashSet.has(verified, identity(server))
          ? Effect.void
          : verifyInstance(server)

      const requestTokens = Effect.fn("requestTokens")(
        function* (origin: string, params: Readonly<Record<string, string>>) {
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
            .pipe(Effect.mapError((cause) => new AuthUnavailable({ cause })))
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
        },
        Effect.timeoutOrElse({
          duration: authTimeout,
          orElse: () => Effect.fail(new AuthUnavailable({ cause: "timeout" }))
        })
      )

      const forgetTokens = (instanceId: string) =>
        store.clearTokens(instanceId).pipe(Effect.andThen(publish(instanceId)))

      const forgetIfCurrent = (instanceId: string, accessToken: string) =>
        exclusively(instanceId)(
          store
            .tokens(instanceId)
            .pipe(
              Effect.flatMap((stored) =>
                Option.exists(
                  stored,
                  (tokens) => tokens.accessToken === accessToken
                )
                  ? forgetTokens(instanceId)
                  : Effect.void
              )
            )
        ).pipe(Effect.ignore)

      const clientFor = (server: SavedServer, token: string) =>
        HttpApiClient.make(AppApi, {
          baseUrl: `${server.origin}/api`,
          transformClient: (client) =>
            client.pipe(
              HttpClient.mapRequest(HttpClientRequest.bearerToken(token)),
              HttpClient.tap((response) =>
                response.status === 401
                  ? forgetIfCurrent(server.instanceId, token)
                  : Effect.void
              )
            )
        }).pipe(Effect.provideService(HttpClient.HttpClient, http))

      const fetchAccount = Effect.fn("fetchAccount")(
        function* (server: SavedServer, token: string) {
          const client = yield* clientFor(server, token)
          const [user, orgs] = yield* Effect.all(
            [client.auth.me(), client.org.myOrgs()],
            { concurrency: 2 }
          ).pipe(Effect.mapError((cause) => new AuthUnavailable({ cause })))
          const account: SavedServer = {
            ...server,
            user: { id: user.id, name: user.name, email: user.email },
            orgs: orgs.map((org) => ({ slug: org.slug, name: org.name }))
          }
          return { account, activeOrgSlug: user.activeOrgSlug }
        },
        Effect.timeoutOrElse({
          duration: authTimeout,
          orElse: () => Effect.fail(new AuthUnavailable({ cause: "timeout" }))
        })
      )

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
        yield* ensureVerified(server)
        return yield* exclusively(instanceId)(
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
        const { account, activeOrgSlug } = yield* fetchAccount(
          server,
          tokens.accessToken
        )
        yield* exclusively(instanceId)(store.completeSignIn(account, tokens))
        const start =
          account.orgs.find((org) => org.slug === activeOrgSlug) ??
          account.orgs[0]
        const location = Option.map(
          Option.fromUndefinedOr(start),
          (org): OrgLocation => ({ instanceId, orgSlug: org.slug })
        )
        if (Option.isSome(location)) {
          yield* store.setLastUsedOrg(location.value)
        }
        yield* publish(instanceId)
        return location
      })

      const refreshAccount = Effect.fn("refreshAccount")(function* (
        instanceId: string
      ) {
        const server = yield* savedServer(instanceId)
        const token = yield* accessToken(instanceId)
        const { account } = yield* fetchAccount(server, token)
        yield* store.updateAccount(account)
        yield* publish(instanceId)
      })

      const revoke = (server: SavedServer, tokens: ServerTokens) =>
        verifyInstance(server).pipe(
          Effect.andThen(
            http.execute(
              HttpClientRequest.post(
                `${server.origin}/api/auth/oauth2/revoke`
              ).pipe(
                HttpClientRequest.bodyUrlParams({
                  client_id: appClientId,
                  token: tokens.refreshToken,
                  token_type_hint: "refresh_token"
                })
              )
            )
          ),
          Effect.timeout(authTimeout),
          Effect.ignore
        )

      const signOutLocked = (server: SavedServer) =>
        store.tokens(server.instanceId).pipe(
          Effect.tap(() =>
            forgetTokens(server.instanceId).pipe(Effect.uninterruptible)
          ),
          Effect.flatMap(
            Option.match({
              onNone: () => Effect.void,
              onSome: (tokens) => revoke(server, tokens)
            })
          )
        )

      const signOut = Effect.fn("signOut")(function* (instanceId: string) {
        const server = yield* savedServer(instanceId)
        yield* exclusively(instanceId)(signOutLocked(server))
      })

      const remove = Effect.fn("remove")(function* (instanceId: string) {
        const server = yield* savedServer(instanceId)
        yield* exclusively(instanceId)(
          signOutLocked(server).pipe(
            Effect.andThen(store.remove(instanceId)),
            Effect.andThen(
              Effect.sync(() =>
                MutableHashSet.remove(verified, identity(server))
              )
            )
          )
        )
        yield* publish(instanceId)
      })

      return { signIn, signOut, remove, refreshAccount, accessToken, api }
    })
  }
) {
  static readonly layer = Layer.effect(this, this.make)
}
