import * as Data from "effect/Data"
import * as Result from "effect/Result"
import * as Schema from "effect/Schema"
import { URL, URLSearchParams } from "whatwg-url-minimum"

export const appClientId = "projectproject-app"
export const appRedirectUri = "projectproject://oauth/callback"
export const appScopes = "openid profile email offline_access"

export type Pkce = Readonly<{
  verifier: string
  challenge: string
  state: string
}>

export const apiResource = (origin: string) => `${origin}/api`

export const authorizeUrl = (origin: string, pkce: Pkce) =>
  `${origin}/api/auth/oauth2/authorize?${new URLSearchParams({
    response_type: "code",
    client_id: appClientId,
    redirect_uri: appRedirectUri,
    scope: appScopes,
    state: pkce.state,
    code_challenge: pkce.challenge,
    code_challenge_method: "S256",
    resource: apiResource(origin)
  }).toString()}`

export class SignInRejected extends Data.TaggedError("SignInRejected")<
  Readonly<{
    reason: "bad_redirect" | "state_mismatch" | "denied" | "no_code"
  }>
> {}

const expectedRedirect = new URL(appRedirectUri)

const parseRedirect = (callbackUrl: string) =>
  Result.try({
    try: () => new URL(callbackUrl),
    catch: () => new SignInRejected({ reason: "bad_redirect" })
  }).pipe(
    Result.filterOrFail(
      (url) =>
        url.protocol === expectedRedirect.protocol &&
        url.host === expectedRedirect.host &&
        url.pathname === expectedRedirect.pathname,
      () => new SignInRejected({ reason: "bad_redirect" })
    )
  )

export const authorizationCode = (callbackUrl: string, expectedState: string) =>
  Result.flatMap(parseRedirect(callbackUrl), (url) => {
    const params = url.searchParams
    if (params.get("state") !== expectedState) {
      return Result.fail(new SignInRejected({ reason: "state_mismatch" }))
    }
    if (params.has("error")) {
      return Result.fail(new SignInRejected({ reason: "denied" }))
    }
    const code = params.get("code")
    return code === null
      ? Result.fail(new SignInRejected({ reason: "no_code" }))
      : Result.succeed(code)
  })

export const TokenResponse = Schema.Struct({
  access_token: Schema.NonEmptyString,
  refresh_token: Schema.NonEmptyString,
  expires_in: Schema.Finite
})

export const TokenError = Schema.Struct({ error: Schema.String })
