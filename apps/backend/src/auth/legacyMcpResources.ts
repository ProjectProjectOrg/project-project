import { sql } from "drizzle-orm"

export const legacyMcpResources = (input: {
  readonly db: {
    readonly execute: (query: ReturnType<typeof sql>) => Promise<unknown>
  }
  readonly resource: string
}) => ({
  id: "legacy-mcp-resources",
  init: async () => {
    await input.db.execute(sql`
      INSERT INTO oauth_client_resource (id, client_id, resource_id, created_at)
      SELECT gen_random_uuid()::text, client.client_id, ${input.resource}, now()
      FROM oauth_client AS client
      INNER JOIN oauth_application AS legacy
        ON legacy.id = client.id AND legacy.client_id = client.client_id
      ON CONFLICT (client_id, resource_id) DO NOTHING
    `)
  }
})
