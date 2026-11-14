import { HttpApiEndpoint, HttpApiGroup } from "effect/http-api"
import * as Schema from "effect/Schema"

import { NotFound, Unauthorized, Validation } from "../errors"
import { Authentication } from "./Authentication"
import { OAuthApplication } from "./OAuthApplication"
import { SignInProvider } from "./SignInProvider"
import { UpdateUserSettingsInput, User, UserSettings } from "./User"

export const AuthGroup = HttpApiGroup.make("auth")
  .add(
    HttpApiEndpoint.get("me", "/me", {
      success: User,
      error: Unauthorized
    })
  )
  .add(
    HttpApiEndpoint.patch("updateSettings", "/me/settings", {
      payload: UpdateUserSettingsInput,
      success: UserSettings,
      error: [Unauthorized, Validation]
    })
  )
  .middleware(Authentication)

export const PublicAuthGroup = HttpApiGroup.make("publicAuth").add(
  HttpApiEndpoint.get("signInProviders", "/sign-in-providers", {
    success: Schema.Struct({ providers: Schema.Array(SignInProvider) })
  })
)

export const OAuthApplicationsGroup = HttpApiGroup.make("oauthApplications")
  .add(
    HttpApiEndpoint.get("list", "/oauth-applications", {
      success: Schema.Array(OAuthApplication),
      error: Unauthorized
    })
  )
  .add(
    HttpApiEndpoint.delete("revoke", "/oauth-applications/:id", {
      params: Schema.Struct({ id: Schema.String }),
      success: Schema.Struct({ ok: Schema.Literal(true) }),
      error: [Unauthorized, NotFound]
    })
  )
  .add(
    HttpApiEndpoint.post("consent", "/oauth-applications/consent", {
      payload: Schema.Struct({
        accept: Schema.Boolean,
        oauth_query: Schema.String
      }),
      success: Schema.Struct({ redirectURI: Schema.String }),
      error: [Unauthorized, Validation]
    })
  )
  .middleware(Authentication)

export const PublicOAuthGroup = HttpApiGroup.make("publicOAuth").add(
  HttpApiEndpoint.get("publicClient", "/oauth-applications/public", {
    query: Schema.Struct({ client_id: Schema.String }),
    success: Schema.Struct({ name: Schema.NullOr(Schema.String) }),
    error: [NotFound]
  })
)
