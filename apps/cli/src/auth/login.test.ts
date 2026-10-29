import { cliOAuthClient } from "@pp/shared"
import * as Option from "effect/Option"
import { describe, expect, it } from "vitest"

import { authorizeUrl } from "./login"

describe("authorizeUrl", () => {
  it("asks for the tools resource as the built-in client, with PKCE", () => {
    const url = new URL(
      authorizeUrl(
        {
          origin: "https://pp.example.com",
          resource: "https://pp.example.com/api/v1/tools",
          authorizationEndpoint:
            "https://pp.example.com/api/auth/oauth2/authorize",
          tokenEndpoint: "https://pp.example.com/api/auth/oauth2/token",
          revocationEndpoint: undefined,
          catalogVersion: undefined,
          signInPages: Option.none()
        },
        "http://127.0.0.1:51234/callback",
        { verifier: "v", challenge: "c", state: "s" }
      )
    )
    expect(Object.fromEntries(url.searchParams)).toEqual({
      response_type: "code",
      client_id: cliOAuthClient.id,
      redirect_uri: "http://127.0.0.1:51234/callback",
      scope: "openid profile email offline_access",
      state: "s",
      code_challenge: "c",
      code_challenge_method: "S256",
      resource: "https://pp.example.com/api/v1/tools"
    })
  })
})
