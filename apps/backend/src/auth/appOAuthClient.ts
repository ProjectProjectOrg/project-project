import { appOAuthClientId, appOAuthRedirectUri } from "@pp/shared"
import { createAuthMiddleware } from "better-auth/api"
import { sql } from "drizzle-orm"
import * as Option from "effect/Option"
import * as Schema from "effect/Schema"

type AppOAuthClientInput = Readonly<{
  db: Readonly<{
    execute: (query: ReturnType<typeof sql>) => Promise<unknown>
  }>
}>

const AuthorizeQuery = Schema.Struct({
  client_id: Schema.String,
  sig: Schema.optional(Schema.String)
})

const decodeAuthorizeQuery = Schema.decodeUnknownOption(AuthorizeQuery)

type AuthorizeContext = Readonly<{
  query?: Readonly<Record<string, string | ReadonlyArray<string>>>
  request?: Request
}>

const initialAppAuthorizeRequest = ({ query, request }: AuthorizeContext) =>
  request !== undefined &&
  new URL(request.url).pathname.endsWith("/oauth2/authorize") &&
  Option.exists(
    decodeAuthorizeQuery(query),
    (decoded) =>
      decoded.client_id === appOAuthClientId && decoded.sig === undefined
  )

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
  },
  hooks: {
    before: [
      {
        matcher: (context: Readonly<{ path?: string }>) =>
          context.path === "/oauth2/authorize",
        handler: createAuthMiddleware(async (ctx) =>
          initialAppAuthorizeRequest(ctx)
            ? { context: { query: { ...ctx.query, prompt: "login consent" } } }
            : undefined
        )
      }
    ]
  }
})
