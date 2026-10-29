import { catalogVersion, cliOAuthClient, cliRelease, Tools } from "@pp/shared"
import * as Console from "effect/Console"
import * as Effect from "effect/Effect"
import * as Option from "effect/Option"

import { callToolAs } from "../client/callTool"
import { CliFailure, ExitCode, notSignedIn, usage } from "../CliFailure"
import { originOf } from "../servers/origin"
import { type SavedServer, ServerStore } from "../servers/ServerStore"
import { Browser } from "./Browser"
import { type Discovered, discover } from "./discovery"
import { type Listening, Loopback } from "./Loopback"
import { newPkce, type Pkce } from "./pkce"
import { exchangeCode } from "./tokens"

const SCOPES = "openid profile email offline_access"

export const authorizeUrl = (
  discovered: Discovered,
  redirectUri: string,
  pkce: Pkce
) => {
  const url = new URL(discovered.authorizationEndpoint)
  url.search = new URLSearchParams({
    response_type: "code",
    client_id: cliOAuthClient.id,
    redirect_uri: redirectUri,
    scope: SCOPES,
    state: pkce.state,
    code_challenge: pkce.challenge,
    code_challenge_method: "S256",
    resource: discovered.resource
  }).toString()
  return url.href
}

const codeFrom = (params: URLSearchParams, pkce: Pkce) => {
  if (params.get("state") !== pkce.state) {
    return Effect.fail(
      notSignedIn("The sign-in redirect didn't match this login. Try again.")
    )
  }
  const error = params.get("error")
  if (error !== null) {
    return Effect.fail(
      notSignedIn(
        error === "access_denied"
          ? "Sign-in was cancelled."
          : `Sign-in failed: ${params.get("error_description") ?? error}.`
      )
    )
  }
  const code = params.get("code")
  return code === null
    ? Effect.fail(notSignedIn("The sign-in redirect had no code. Try again."))
    : Effect.succeed(code)
}

const redirected = (listening: Listening) =>
  listening.redirect.pipe(
    Effect.timeoutOrElse({
      duration: "10 minutes",
      orElse: () =>
        Effect.fail(notSignedIn("Sign-in timed out. Run `pp login` again."))
    })
  )

const completeSignIn = (
  discovered: Discovered,
  pkce: Pkce,
  redirectUri: string,
  params: URLSearchParams
) =>
  Effect.gen(function* () {
    const code = yield* codeFrom(params, pkce)
    const tokens = yield* exchangeCode({
      tokenEndpoint: discovered.tokenEndpoint,
      code,
      redirectUri,
      verifier: pkce.verifier,
      resource: discovered.resource
    })
    const signedIn: SavedServer = {
      origin: discovered.origin,
      user: { id: "", name: "", email: "" },
      endpoints: {
        token: discovered.tokenEndpoint,
        revocation: discovered.revocationEndpoint
      },
      tokens
    }
    const me = yield* callToolAs(
      signedIn,
      "me",
      {},
      Tools.tools.me.successSchema
    )
    const server: SavedServer = {
      ...signedIn,
      user: { id: me.user.id, name: me.user.name, email: me.user.email }
    }
    yield* (yield* ServerStore).save(server)
    return server
  })

const signIn = (discovered: Discovered, pkce: Pkce) =>
  Effect.scoped(
    Effect.gen(function* () {
      const listening = yield* (yield* Loopback).listen(discovered.signInPages)
      const url = authorizeUrl(discovered, listening.redirectUri, pkce)
      yield* Console.error(
        `Opening your browser to sign in to ${discovered.origin}.\nIf it doesn't open, visit:\n\n  ${url}\n`
      )
      yield* (yield* Browser).open(url)
      const params = yield* redirected(listening)
      return yield* completeSignIn(
        discovered,
        pkce,
        listening.redirectUri,
        params
      ).pipe(
        Effect.tapError(() =>
          listening.finish({
            signedIn: false,
            reason: params.get("error") ?? "sign_in_failed"
          })
        ),
        Effect.tap(() => listening.finish({ signedIn: true }))
      )
    })
  )

export const login = Effect.fn("login")(function* (address: string) {
  const origin = yield* Option.match(originOf(address), {
    onNone: () => Effect.fail(usage(`"${address}" isn't a valid address.`)),
    onSome: Effect.succeed
  })
  const discovered = yield* discover(origin)
  if (
    discovered.catalogVersion !== undefined &&
    discovered.catalogVersion !== catalogVersion
  ) {
    return yield* new CliFailure({
      message: `This pp knows a different set of tools (${catalogVersion}) than ${origin} (${discovered.catalogVersion}). Install the matching version with:\n\n  curl -fsSL ${origin}${cliRelease.installScriptPath} | sh`,
      code: ExitCode.outdated
    })
  }
  return yield* signIn(discovered, yield* newPkce)
})
