import { randomUUID } from "node:crypto"

import { tryGetCurrentAuthEndpointContext } from "@better-auth/core/context"
import { appOAuthClientId, appOAuthRedirectUri } from "@pp/shared"
import { sql } from "drizzle-orm"
import * as Option from "effect/Option"
import * as Schema from "effect/Schema"

type AppOAuthClientInput = Readonly<{
  db: Readonly<{
    execute: (
      query: ReturnType<typeof sql>
    ) => Promise<Readonly<{ rowCount: number | null }>>
  }>
}>

const AuthorizationParameters = Schema.Struct({
  client_id: Schema.String,
  code_challenge: Schema.optional(Schema.String)
})

const decodeAuthorizationParameters = Schema.decodeUnknownOption(
  AuthorizationParameters
)

const EndpointParameters = Schema.Struct({
  query: Schema.optional(Schema.Unknown),
  body: Schema.optional(Schema.Unknown)
})

const decodeEndpointParameters = Schema.decodeUnknownOption(EndpointParameters)

const SignedOAuthQuery = Schema.Struct({ oauth_query: Schema.String })

const decodeSignedOAuthQuery = Schema.decodeUnknownOption(SignedOAuthQuery)

const signedQueryIssuedAtParam = "ba_iat"

const currentAuthorization = () =>
  decodeEndpointParameters(tryGetCurrentAuthEndpointContext()).pipe(
    Option.flatMap((endpoint) => {
      const signed = decodeSignedOAuthQuery(endpoint.body).pipe(
        Option.map((body) => new URLSearchParams(body.oauth_query))
      )
      return decodeAuthorizationParameters(endpoint.query).pipe(
        Option.orElse(() => decodeAuthorizationParameters(endpoint.body)),
        Option.orElse(() =>
          Option.flatMap(signed, (query) =>
            decodeAuthorizationParameters(Object.fromEntries(query))
          )
        ),
        Option.map((parameters) => ({
          parameters,
          signedIssuedAt: Option.flatMap(signed, (query) =>
            Option.fromNullishOr(query.get(signedQueryIssuedAtParam))
          )
        }))
      )
    })
  )

export const appConsentReferenceId = () =>
  Option.match(currentAuthorization(), {
    onNone: () => undefined,
    onSome: ({ parameters, signedIssuedAt }) =>
      parameters.client_id !== appOAuthClientId
        ? undefined
        : Option.match(signedIssuedAt, {
            onNone: () => `app:${randomUUID()}`,
            onSome: (issuedAt) =>
              `app:${issuedAt}:${parameters.code_challenge ?? randomUUID()}`
          })
  })

export const appOAuthClient = (input: AppOAuthClientInput) => ({
  id: "app-oauth-client",
  init: async () => {
    await input.db.execute(sql`
      INSERT INTO oauth_client (
        id, client_id, name, application_type, token_endpoint_auth_method,
        redirect_uris, grant_types, response_types, require_pkce,
        skip_consent, disabled, created_at, updated_at
      )
      VALUES (
        ${appOAuthClientId}, ${appOAuthClientId}, 'ProjectProject app', 'native', 'none',
        ARRAY[${appOAuthRedirectUri}]::text[],
        ARRAY['authorization_code', 'refresh_token']::text[],
        ARRAY['code']::text[],
        true, false, false, now(), now()
      )
      ON CONFLICT (client_id) DO UPDATE SET
        name = EXCLUDED.name,
        application_type = EXCLUDED.application_type,
        token_endpoint_auth_method = EXCLUDED.token_endpoint_auth_method,
        redirect_uris = EXCLUDED.redirect_uris,
        grant_types = EXCLUDED.grant_types,
        response_types = EXCLUDED.response_types,
        require_pkce = EXCLUDED.require_pkce,
        skip_consent = EXCLUDED.skip_consent,
        disabled = EXCLUDED.disabled,
        updated_at = now()
    `)
  }
})
