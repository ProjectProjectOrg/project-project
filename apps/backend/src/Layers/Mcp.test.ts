import { afterAll, beforeAll, describe, expect, it, vi } from "vite-plus/test"
import { randomUUID } from "node:crypto"
import { Pool } from "pg"
import { drizzle } from "drizzle-orm/node-postgres"
import { migrate } from "drizzle-orm/node-postgres/migrator"
import { Clock, FileSystem } from "effect"
import * as BunFileSystem from "@effect/platform-bun/BunFileSystem"
// @effect-diagnostics-next-line nodeBuiltinImport:off
import { createServer, type Server } from "node:http"
import { toNodeHandler } from "better-auth/node"
import * as Effect from "effect/Effect"
import * as Layer from "effect/Layer"
import { HttpRouter } from "effect/unstable/http"
import { McpTools } from "@projectproject/shared"
import { Client } from "@modelcontextprotocol/sdk/client/index.js"
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js"

const databaseUrl = process.env.PROJECTPROJECT_TEST_DATABASE_URL

const meta = {
  "io.modelcontextprotocol/protocolVersion": "2026-07-28",
  "io.modelcontextprotocol/clientInfo": { name: "modern-test", version: "1" },
  "io.modelcontextprotocol/clientCapabilities": {}
}

describe.skipIf(!databaseUrl)("MCP endpoint", () => {
  const userIds = [randomUUID(), randomUUID()]
  const tokens: Array<string> = []
  const consentIds = [randomUUID(), randomUUID()]
  const clientId = randomUUID()
  const orgId = randomUUID()
  let expiredToken: string
  let resource: string
  let server: Server
  const clients: Array<Client> = []
  let pool: Pool
  let filesystem: FileSystem.FileSystem
  let projectsDir: string
  let dispose: (() => Promise<void>) | undefined
  let handlers: Array<(request: Request) => Promise<Response>> = []
  let requestCount = 0
  let handlerCount = 0

  const nextHandler = () => handlers[handlerCount++ % handlers.length]

  const modern = async (
    token: string | undefined,
    method: string,
    params: Record<string, unknown> = {},
    overrides: {
      headers?: Record<string, string | undefined>
      meta?: Record<string, unknown>
    } = {}
  ) => {
    const headers = Object.fromEntries(
      Object.entries({
        "content-type": "application/json",
        accept: "application/json, text/event-stream",
        "mcp-protocol-version": "2026-07-28",
        "mcp-method": method,
        ...(token ? { authorization: `Bearer ${token}` } : {}),
        ...(typeof params.name === "string" ? { "mcp-name": params.name } : {}),
        ...overrides.headers
      }).filter(
        (entry): entry is [string, string] => typeof entry[1] === "string"
      )
    )
    const response = await nextHandler()(
      new Request(resource, {
        method: "POST",
        headers,
        body: JSON.stringify({
          jsonrpc: "2.0",
          id: ++requestCount,
          method,
          params: { ...params, _meta: overrides.meta ?? meta }
        })
      })
    )
    expect(response.headers.get("mcp-session-id")).toBeNull()
    const text = await response.text()
    const contentType = response.headers.get("content-type")
    const body = contentType?.includes("text/event-stream")
      ? JSON.parse(
          text
            .split("\n")
            .findLast((line) => line.startsWith("data:"))!
            .slice(5)
        )
      : text
        ? JSON.parse(text)
        : undefined
    return {
      status: response.status,
      headers: response.headers,
      contentType,
      body
    }
  }

  const callTool = (
    token: string,
    name: string,
    args: Record<string, unknown> = {},
    overrides: {
      headers?: Record<string, string | undefined>
      meta?: Record<string, unknown>
    } = {}
  ) => modern(token, "tools/call", { name, arguments: args }, overrides)

  beforeAll(async () => {
    if (!databaseUrl) throw new Error("Test database URL is required")
    const url = new URL(databaseUrl)
    if (
      !["127.0.0.1", "localhost"].includes(url.hostname) ||
      !url.pathname.startsWith("/projectproject_effect_v4_")
    ) {
      throw new Error("MCP tests require an isolated local database")
    }
    pool = new Pool({ connectionString: databaseUrl })
    await migrate(drizzle({ client: pool }), {
      migrationsFolder: `${import.meta.dirname}/../db/migrations`
    })
    filesystem = await Effect.runPromise(
      Effect.provide(FileSystem.FileSystem, BunFileSystem.layer)
    )
    projectsDir = await Effect.runPromise(
      filesystem.makeTempDirectory({ prefix: "projectproject-mcp-test-" })
    )
    server = createServer()
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve))
    const address = server.address()
    if (!address || typeof address === "string")
      throw new Error("Missing test server address")
    const baseUrl = `http://127.0.0.1:${address.port}`
    resource = `${baseUrl}/mcp`
    for (const [key, value] of Object.entries({
      DATABASE_URL: databaseUrl,
      PROJECTS_DIR: projectsDir,
      BETTER_AUTH_URL: baseUrl,
      MCP_RESOURCE_URL: baseUrl,
      BETTER_AUTH_SECRET: "isolated-effect-v4-oauth-compatibility-test-secret",
      GITHUB_APP_ID: "123",
      GITHUB_APP_PRIVATE_KEY: "-----BEGIN PRIVATE KEY-----test",
      GITHUB_APP_CLIENT_ID: "test",
      GITHUB_APP_CLIENT_SECRET: "test"
    }))
      vi.stubEnv(key, value)
    await pool.query(
      "INSERT INTO oauth_client (id,client_id,name,redirect_uris,created_at) VALUES ($1,$1,$2,ARRAY['http://localhost/callback'],now())",
      [clientId, "Stateless test"]
    )
    await pool.query(
      "INSERT INTO organization (id,name,slug,created_at) VALUES ($1,$2,$1,now())",
      [orgId, "Private organization"]
    )
    const { auth } = await import("../auth")
    server.on("request", toNodeHandler(auth))
    for (const [index, id] of userIds.entries()) {
      await pool.query(
        'INSERT INTO "user" (id,name,email,email_verified,created_at,updated_at) VALUES ($1,$2,$3,true,now(),now())',
        [id, "MCP test", `${id}@example.test`]
      )
      await pool.query(
        "INSERT INTO oauth_provider_consent (id,client_id,user_id,scopes,created_at,updated_at) VALUES ($1,$2,$3,ARRAY['openid'],now(),now())",
        [consentIds[index], clientId, id]
      )
      const signed = await auth.api.signJWT({
        body: {
          payload: {
            sub: id,
            client_id: clientId,
            pp_consent_ids: [consentIds[index]],
            aud: resource,
            iss: `${baseUrl}/api/auth`,
            exp:
              Math.floor(
                (await Effect.runPromise(Clock.currentTimeMillis)) / 1000
              ) + 3600
          }
        }
      })
      tokens.push(signed.token)
      if (index === 0) {
        expiredToken = (
          await auth.api.signJWT({
            body: {
              payload: {
                sub: id,
                client_id: clientId,
                pp_consent_ids: [consentIds[index]],
                aud: resource,
                iss: `${baseUrl}/api/auth`,
                exp:
                  Math.floor(
                    (await Effect.runPromise(Clock.currentTimeMillis)) / 1000
                  ) - 3600
              }
            }
          })
        ).token
      }
    }
    const { McpLive } = await import("./Mcp")
    const { BackendServicesLive, BackendInfrastructureLive } =
      await import("../runtime")
    const app = McpLive.pipe(
      Layer.provide(
        BackendServicesLive.pipe(Layer.provideMerge(BackendInfrastructureLive))
      )
    )
    const built = [
      HttpRouter.toWebHandler(app, { disableLogger: true }),
      HttpRouter.toWebHandler(app, { disableLogger: true })
    ]
    handlers = built.map((b) => b.handler)
    dispose = async () => {
      await Promise.all(built.map((b) => b.dispose()))
    }
  })

  afterAll(async () => {
    await Promise.all(clients.map((client) => client.close()))
    await dispose?.()
    if (projectsDir)
      await Effect.runPromise(
        filesystem.remove(projectsDir, { recursive: true, force: true })
      )
    if (pool) {
      await pool.query("DELETE FROM oauth_client WHERE client_id=$1", [
        clientId
      ])
      await pool.query('DELETE FROM "user" WHERE id=ANY($1)', [userIds])
      await pool.query("DELETE FROM organization WHERE id=$1", [orgId])
      await pool.end()
    }
    if (server)
      await new Promise<void>((resolve, reject) =>
        server.close((error) => (error ? reject(error) : resolve()))
      )
    vi.unstubAllEnvs()
  })

  it("modern: discover lists all served revisions", async () => {
    const { status, body } = await modern(tokens[0], "server/discover")
    expect(status).toBe(200)
    expect(body.result.supportedVersions).toEqual([
      "2026-07-28",
      "2025-11-25",
      "2025-06-18"
    ])
  })

  it("modern: lists the catalog tools with object input schemas", async () => {
    const { body } = await modern(tokens[0], "tools/list")
    const names = body.result.tools
      .map((t: { name: string }) => t.name)
      .toSorted()
    expect(names).toEqual(Object.keys(McpTools).toSorted())
    for (const tool of body.result.tools)
      expect(tool.inputSchema.type).toBe("object")
  })

  it("modern: isolates users across round-robin handlers", async () => {
    await Promise.all(
      Array.from({ length: 6 }, async (_, i) => {
        const userIndex = [0, 0, 1, 0, 1, 1][i]
        const { body } = await callTool(tokens[userIndex], "me")
        expect(body.result.isError).toBeFalsy()
        expect(body.result.content[0].text).toContain(userIds[userIndex])
      })
    )
  })

  it("modern: the request user survives a progress-token response", async () => {
    const { status, contentType, body } = await callTool(
      tokens[0],
      "me",
      {},
      {
        meta: { ...meta, "io.modelcontextprotocol/progressToken": 1 }
      }
    )
    expect(status).toBe(200)
    expect(contentType).toMatch(/application\/json|text\/event-stream/)
    expect(body.result.isError).toBeFalsy()
    expect(body.result.content[0].text).toContain(userIds[0])
  })

  it("modern: validation and not-found errors are isError text", async () => {
    const invalid = await callTool(tokens[0], "create_ticket", {
      orgSlug: "acme",
      projectSlug: "demo",
      title: ""
    })
    expect(invalid.body.result.isError).toBe(true)
    expect(invalid.body.result.content[0].text).toContain(
      "Invalid parameters for tool 'create_ticket'"
    )
    const missing = await callTool(tokens[0], "get_org", { orgSlug: orgId })
    expect(missing.body.result.isError).toBe(true)
    expect(missing.body.result.content[0].text).toContain("Not found.")
  })

  it("modern: unknown tool is JSON-RPC -32602", async () => {
    const { body } = await callTool(tokens[0], "not_a_tool")
    expect(body.error.code).toBe(-32602)
  })

  it("modern: unsupported protocol version is 400 with -32022 and the supported list", async () => {
    const { status, body } = await modern(
      tokens[0],
      "tools/list",
      {},
      {
        headers: { "mcp-protocol-version": "1900-01-01" },
        meta: {
          ...meta,
          "io.modelcontextprotocol/protocolVersion": "1900-01-01"
        }
      }
    )
    expect(status).toBe(400)
    expect(body.error.code).toBe(-32022)
    expect(body.error.data.supported).toContain("2026-07-28")
  })

  it("modern: Mcp-Name mismatch is 400 with -32020", async () => {
    const { status, body } = await modern(
      tokens[0],
      "tools/call",
      { name: "me", arguments: {} },
      { headers: { "mcp-name": "other" } }
    )
    expect(status).toBe(400)
    expect(body.error.code).toBe(-32020)
    expect(body.error.message).toContain(
      "Mcp-Name header does not match request parameters"
    )
  })

  it("modern: missing MCP-Protocol-Version header is 400", async () => {
    const { status, body } = await modern(
      tokens[0],
      "tools/list",
      {},
      { headers: { "mcp-protocol-version": undefined } }
    )
    expect(status).toBe(400)
    expect(body.error.message).toContain(
      "MCP-Protocol-Version header is required"
    )
  })

  it("auth: unauthenticated and expired requests get a 401 challenge", async () => {
    const anonymous = await modern(undefined, "tools/list")
    expect(anonymous.status).toBe(401)
    expect(anonymous.headers.get("www-authenticate")).toContain("Bearer")
    expect(anonymous.headers.get("www-authenticate")).toContain(
      "resource_metadata"
    )
    const expired = await modern(expiredToken, "tools/list")
    expect(expired.status).toBe(401)
  })

  it("auth: GET and DELETE are 405", async () => {
    for (const method of ["GET", "DELETE"]) {
      const response = await handlers[0](
        new Request(resource, {
          method,
          headers: { authorization: `Bearer ${tokens[0]}` }
        })
      )
      expect(response.status).toBe(405)
      expect(response.headers.get("allow")).toBe("POST")
    }
  })

  it("legacy: SDK client negotiates 2025-11-25 with a session and can call tools", async () => {
    const client = new Client({ name: "legacy-test", version: "1" })
    clients.push(client)
    let sessionSeen = false
    let negotiatedVersion: string | null = null
    const transport = new StreamableHTTPClientTransport(new URL(resource), {
      requestInit: { headers: { authorization: `Bearer ${tokens[1]}` } },
      fetch: async (input, init) => {
        const response = await handlers[0](new Request(input.toString(), init))
        if (response.headers.get("mcp-session-id")) sessionSeen = true
        negotiatedVersion = response.headers.get("mcp-protocol-version")
        return response
      }
    })
    await client.connect(transport)
    expect(sessionSeen).toBe(true)
    expect(transport.sessionId).toBeDefined()
    const result = await client.callTool({ name: "me", arguments: {} })
    expect(negotiatedVersion).toBe("2025-11-25")
    expect(result).toMatchObject({
      content: [{ type: "text", text: expect.stringContaining(userIds[1]) }]
    })
  })

  describe("after consent revocation", () => {
    it("auth: revoking consent locks the token out", async () => {
      await pool.query("DELETE FROM oauth_provider_consent WHERE id=$1", [
        consentIds[0]
      ])
      const { status } = await modern(tokens[0], "tools/list")
      expect(status).toBe(401)
      const other = await callTool(tokens[1], "me")
      expect(other.body.result.content[0].text).toContain(userIds[1])
    })
  })
})
