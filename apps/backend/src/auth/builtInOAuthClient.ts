import { sql } from "drizzle-orm"

type BuiltInOAuthClientInput = Readonly<{
  db: Readonly<{
    execute: (query: ReturnType<typeof sql>) => Promise<unknown>
  }>
  client: Readonly<{
    id: string
    name: string
    redirectUri: string
  }>
  resource: Readonly<{ identifier: string; name: string }>
}>

export const builtInOAuthClient = ({
  db,
  client,
  resource
}: BuiltInOAuthClientInput) => ({
  id: `built-in-oauth-client:${client.id}`,
  init: async () => {
    await db.execute(sql`
      INSERT INTO oauth_resource (id, identifier, name, created_at, updated_at)
      VALUES (gen_random_uuid()::text, ${resource.identifier}, ${resource.name}, now(), now())
      ON CONFLICT (identifier) DO NOTHING
    `)
    await db.execute(sql`
      INSERT INTO oauth_client (
        id, client_id, name, application_type, token_endpoint_auth_method,
        redirect_uris, grant_types, response_types, require_pkce,
        skip_consent, disabled, created_at, updated_at
      )
      VALUES (
        ${client.id}, ${client.id}, ${client.name}, 'native', 'none',
        ARRAY[${client.redirectUri}]::text[],
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
        updated_at = now()
    `)
    await db.execute(sql`
      INSERT INTO oauth_client_resource (id, client_id, resource_id, created_at)
      VALUES (gen_random_uuid()::text, ${client.id}, ${resource.identifier}, now())
      ON CONFLICT (client_id, resource_id) DO NOTHING
    `)
  }
})
