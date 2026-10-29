import { sql } from "drizzle-orm"
import * as Schema from "effect/Schema"

const decodeResult = Schema.decodeUnknownSync(
  Schema.Struct({ rowCount: Schema.NullOr(Schema.Number) })
)

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

export class BuiltInOAuthClientConflict extends Error {
  constructor(clientId: string) {
    super(
      `oauth_client "${clientId}" exists but wasn't created by this server: it has a secret, an owner or a different id. Remove or rename it so the built-in client can be registered.`
    )
  }
}

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
    const registered = await db.execute(sql`
      WITH registered AS (
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
        WHERE oauth_client.id = EXCLUDED.id
          AND oauth_client.client_secret IS NULL
          AND oauth_client.user_id IS NULL
          AND oauth_client.reference_id IS NULL
        RETURNING client_id
      ),
      unlinked AS (
        DELETE FROM oauth_client_resource
        WHERE client_id IN (SELECT client_id FROM registered)
          AND resource_id <> ${resource.identifier}
      ),
      linked AS (
        INSERT INTO oauth_client_resource (id, client_id, resource_id, created_at)
        SELECT gen_random_uuid()::text, client_id, ${resource.identifier}, now()
        FROM registered
        ON CONFLICT (client_id, resource_id) DO NOTHING
      )
      SELECT client_id FROM registered
    `)
    if (decodeResult(registered).rowCount !== 1) {
      throw new BuiltInOAuthClientConflict(client.id)
    }
  }
})
