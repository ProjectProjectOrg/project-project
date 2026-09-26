import { appOAuthClientId, appOAuthRedirectUri } from "@pp/shared"
import { sql } from "drizzle-orm"

export const appOAuthClient = (input: {
  readonly db: {
    readonly execute: (query: ReturnType<typeof sql>) => Promise<unknown>
  }
}) => ({
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
