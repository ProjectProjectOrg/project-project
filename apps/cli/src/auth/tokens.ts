import { cliOAuthClient } from "@pp/shared"
import * as Clock from "effect/Clock"
import * as Effect from "effect/Effect"
import { HttpClient, HttpClientRequest, HttpClientResponse } from "effect/http"
import * as Schema from "effect/Schema"

import { notSignedIn, unreachable } from "../CliFailure"

const TokenResponse = Schema.Struct({
  access_token: Schema.String,
  refresh_token: Schema.String,
  expires_in: Schema.Finite
})

export type Tokens = Readonly<{
  accessToken: string
  refreshToken: string
  expiresAt: number
}>

const requestTokens = (
  tokenEndpoint: string,
  params: Readonly<Record<string, string>>
) =>
  Effect.gen(function* () {
    const client = yield* HttpClient.HttpClient
    const response = yield* HttpClientRequest.post(tokenEndpoint).pipe(
      HttpClientRequest.bodyUrlParams({
        ...params,
        client_id: cliOAuthClient.id
      }),
      HttpClientRequest.acceptJson,
      client.execute,
      Effect.mapError(() =>
        unreachable(`Couldn't reach the sign-in server at ${tokenEndpoint}.`)
      )
    )
    if (response.status !== 200) {
      return yield* notSignedIn(
        "The server didn't accept the sign-in. Run `pp login` again."
      )
    }
    const body = yield* HttpClientResponse.schemaBodyJson(TokenResponse)(
      response
    ).pipe(
      Effect.mapError(() =>
        notSignedIn("The server sent an unexpected sign-in response.")
      )
    )
    const now = yield* Clock.currentTimeMillis
    const tokens: Tokens = {
      accessToken: body.access_token,
      refreshToken: body.refresh_token,
      expiresAt: now + body.expires_in * 1000
    }
    return tokens
  })

export const exchangeCode = (
  input: Readonly<{
    tokenEndpoint: string
    code: string
    redirectUri: string
    verifier: string
    resource: string
  }>
) =>
  requestTokens(input.tokenEndpoint, {
    grant_type: "authorization_code",
    code: input.code,
    redirect_uri: input.redirectUri,
    code_verifier: input.verifier,
    resource: input.resource
  })

export const refreshTokens = (
  input: Readonly<{
    tokenEndpoint: string
    refreshToken: string
    resource: string
  }>
) =>
  requestTokens(input.tokenEndpoint, {
    grant_type: "refresh_token",
    refresh_token: input.refreshToken,
    resource: input.resource
  })

export const revokeToken = (revocationEndpoint: string, token: string) =>
  Effect.flatMap(HttpClient.HttpClient, (client) =>
    HttpClientRequest.post(revocationEndpoint).pipe(
      HttpClientRequest.bodyUrlParams({
        token,
        token_type_hint: "refresh_token",
        client_id: cliOAuthClient.id
      }),
      client.execute,
      Effect.asVoid,
      Effect.ignore
    )
  )
