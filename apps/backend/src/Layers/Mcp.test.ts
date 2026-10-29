// @effect-diagnostics-next-line nodeBuiltinImport:off
import { randomUUID } from "node:crypto"
// @effect-diagnostics-next-line nodeBuiltinImport:off
import { mkdtemp, rm } from "node:fs/promises"
// @effect-diagnostics-next-line nodeBuiltinImport:off
import { createServer, type Server } from "node:http"
import { tmpdir } from "node:os"
// @effect-diagnostics-next-line nodeBuiltinImport:off
import { join } from "node:path"

import { Client } from "@modelcontextprotocol/sdk/client/index.js"
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js"
import { migrationsFolder } from "@pp/db"
import { catalogVersion, cliOAuthClient, Tools } from "@pp/shared"
import { toNodeHandler } from "better-auth/node"
import { drizzle } from "drizzle-orm/node-postgres"
import { migrate } from "drizzle-orm/node-postgres/migrator"
import * as DateTime from "effect/DateTime"
import { HttpRouter } from "effect/http"
import * as Layer from "effect/Layer"
import { Pool } from "pg"
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest"

const databaseUrl = process.env.PROJECTPROJECT_TEST_DATABASE_URL

const meta = {
  "io.modelcontextprotocol/protocolVersion": "2026-07-28",
  "io.modelcontextprotocol/clientInfo": { name: "modern-test", version: "1" },
  "io.modelcontextprotocol/clientCapabilities": {}
}

const httpFetch = globalThis.fetch.bind(globalThis)

const readJson = async (response: Response) => JSON.parse(await response.text())

describe.skipIf(!databaseUrl)("MCP endpoint", () => {
  const userIds = [randomUUID(), randomUUID()]
  const tokens: Array<string> = []
  const cliTokens: Array<string> = []
  const cliConsentIds = [randomUUID(), randomUUID()]
  let toolsResource: string
  const consentIds = [randomUUID(), randomUUID()]
  const clientId = randomUUID()
  const orgId = randomUUID()
  let expiredToken: string
  let resource: string
  let server: Server
  const clients: Array<Client> = []
  let pool: Pool
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
      migrationsFolder
    })
    projectsDir = await mkdtemp(join(tmpdir(), "projectproject-mcp-test-"))
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
    await auth.$context
    toolsResource = `${baseUrl}${cliOAuthClient.resourcePath}`
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
              Math.floor(DateTime.nowUnsafe().epochMilliseconds / 1000) + 3600
          }
        }
      })
      tokens.push(signed.token)
      await pool.query(
        "INSERT INTO oauth_provider_consent (id,client_id,user_id,scopes,created_at,updated_at) VALUES ($1,$2,$3,ARRAY['openid'],now(),now())",
        [cliConsentIds[index], cliOAuthClient.id, id]
      )
      const cliSigned = await auth.api.signJWT({
        body: {
          payload: {
            sub: id,
            client_id: cliOAuthClient.id,
            pp_consent_ids: [cliConsentIds[index]],
            aud: toolsResource,
            iss: `${baseUrl}/api/auth`,
            exp:
              Math.floor(DateTime.nowUnsafe().epochMilliseconds / 1000) + 3600
          }
        }
      })
      cliTokens.push(cliSigned.token)
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
                  Math.floor(DateTime.nowUnsafe().epochMilliseconds / 1000) -
                  3600
              }
            }
          })
        ).token
      }
    }
    const { McpLive } = await import("./Mcp")
    const { ToolsRouteLive } = await import("../tools/http")
    const { CliInstallRouteLive } = await import("../tools/cliInstall")
    const { BackendServicesLive, BackendInfrastructureLive } =
      await import("../runtime")
    const app = Layer.mergeAll(
      McpLive,
      ToolsRouteLive,
      CliInstallRouteLive
    ).pipe(
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
    if (projectsDir) await rm(projectsDir, { recursive: true, force: true })
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
  }, 30_000)

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
    expect(names).toEqual(Object.keys(Tools.tools).toSorted())
    for (const tool of body.result.tools)
      expect(tool.inputSchema.type).toBe("object")
  })

  it("modern: tells hosts which tools only read", async () => {
    const { body } = await modern(tokens[0], "tools/list")
    const annotations = Object.fromEntries(
      body.result.tools.map((t: { name: string; annotations: unknown }) => [
        t.name,
        t.annotations
      ])
    )
    for (const tool of body.result.tools)
      expect(tool.annotations.title).toEqual(expect.any(String))
    expect(annotations.get_ticket).toMatchObject({
      readOnlyHint: true,
      destructiveHint: false,
      openWorldHint: false
    })
    expect(annotations.update_ticket).toMatchObject({
      readOnlyHint: false,
      destructiveHint: true
    })
    expect(annotations.get_git_state).toMatchObject({
      readOnlyHint: false,
      destructiveHint: false,
      openWorldHint: true
    })
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

  it("modern: invalid parameters are an isError tool result", async () => {
    const { body } = await callTool(tokens[0], "create_ticket", {
      orgSlug: "acme",
      projectSlug: "demo",
      title: ""
    })
    expect(body.error).toBeUndefined()
    expect(body.result.isError).toBe(true)
    expect(body.result.content[0].text).toContain(
      "Invalid parameters for tool 'create_ticket'"
    )
  })

  it("modern: not-found is isError text", async () => {
    const missing = await callTool(tokens[0], "get_org", { orgSlug: orgId })
    expect(missing.body.result.isError).toBe(true)
    expect(missing.body.result.content[0].text).toBe("Not found.")
  })

  it("modern: a soft-deleted org is not found", async () => {
    await pool.query(
      "INSERT INTO member (id,organization_id,user_id,role,created_at) VALUES ($1,$2,$3,'owner',now())",
      [randomUUID(), orgId, userIds[1]]
    )
    const live = await callTool(tokens[1], "get_org", { orgSlug: orgId })
    expect(live.body.result.isError).toBe(false)
    await pool.query("UPDATE organization SET deleted_at=now() WHERE id=$1", [
      orgId
    ])
    const deleted = await callTool(tokens[1], "get_org", { orgSlug: orgId })
    expect(deleted.body.result.isError).toBe(true)
    expect(deleted.body.result.content[0].text).toBe("Not found.")
    const listed = await callTool(tokens[1], "list_orgs")
    expect(listed.body.result.content[0].text).not.toContain(orgId)
  })

  const httpTool = async (
    token: string | undefined,
    name: string,
    body: unknown = {}
  ) => {
    const headers = new Headers({ "content-type": "application/json" })
    if (token) headers.set("authorization", `Bearer ${token}`)
    const response = await nextHandler()(
      new Request(new URL(`/api/v1/tools/${name}`, resource).href, {
        method: "POST",
        headers,
        body: JSON.stringify(body)
      })
    )
    return { status: response.status, body: JSON.parse(await response.text()) }
  }

  it("http: a tool returns the same result as over MCP", async () => {
    const mcp = await callTool(tokens[0], "me")
    const http = await httpTool(cliTokens[0], "me")
    expect(http.status).toBe(200)
    expect(http.body).toEqual(mcp.body.result.structuredContent)
  })

  it("http: a tool failure carries the same message as over MCP", async () => {
    const mcp = await callTool(tokens[0], "get_org", { orgSlug: orgId })
    const http = await httpTool(cliTokens[0], "get_org", { orgSlug: orgId })
    expect(http.status).toBe(422)
    expect(http.body).toEqual({
      _tag: "ToolFailure",
      error: "NotFound",
      message: mcp.body.result.content[0].text
    })
  })

  it("http: invalid input is a 400 Validation failure", async () => {
    const http = await httpTool(cliTokens[0], "create_ticket", {
      orgSlug: "acme",
      projectSlug: "demo",
      title: ""
    })
    expect(http.status).toBe(400)
    expect(http.body.error).toBe("Validation")
  })

  it("http: input that only fails once decoded is a 400, not a crash", async () => {
    const http = await httpTool(cliTokens[0], "create_sprint", {
      orgSlug: "acme",
      projectSlug: "demo",
      name: "Sprint",
      startsAt: "not-a-date"
    })
    expect(http.status).toBe(400)
    expect(http.body.error).toBe("Validation")
  })

  it("http: an unknown tool is a 404", async () => {
    const http = await httpTool(cliTokens[0], "drop_database")
    expect(http.status).toBe(404)
    expect(http.body.error).toBe("NotFound")
  })

  it("http: calls without a token are told to run pp login", async () => {
    const response = await nextHandler()(
      new Request(new URL("/api/v1/tools/me", resource).href, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: "{}"
      })
    )
    expect(response.status).toBe(401)
    expect(response.headers.get("www-authenticate")).toBe(
      `Bearer resource_metadata="${new URL("/.well-known/oauth-protected-resource/api/v1/tools", resource).href}"`
    )
    const body = JSON.parse(await response.text())
    expect(body).toMatchObject({ _tag: "ToolFailure", error: "Unauthorized" })
    expect(body.message).toContain("pp login")
  })

  it("auth: pp login can discover the tools resource and its authorization server", async () => {
    const resourceResponse = await httpFetch(
      new URL("/.well-known/oauth-protected-resource/api/v1/tools", resource)
    )
    expect(resourceResponse.status).toBe(200)
    const metadata = await readJson(resourceResponse)
    expect(metadata).toMatchObject({
      resource: toolsResource,
      resource_name: cliOAuthClient.name,
      bearer_methods_supported: ["header"]
    })
    const issuer = new URL(metadata.authorization_servers[0])
    const serverResponse = await httpFetch(
      new URL(
        `/.well-known/oauth-authorization-server${issuer.pathname}`,
        issuer.origin
      )
    )
    expect(serverResponse.status).toBe(200)
    const authServer = await readJson(serverResponse)
    expect(authServer.issuer).toBe(issuer.href)
    expect(authServer.authorization_endpoint).toEqual(expect.any(String))
    expect(authServer.token_endpoint).toEqual(expect.any(String))
  })

  it("http: the server publishes the catalog version pp was built with", async () => {
    const metadata = await readJson(
      await httpFetch(
        new URL("/.well-known/oauth-protected-resource/api/v1/tools", resource)
      )
    )
    expect(metadata.pp_catalog_version).toBe(catalogVersion)
    expect(metadata.pp_signed_in_page).toBe(
      new URL("/cli/signed-in", resource).href
    )
    expect(metadata.pp_sign_in_failed_page).toBe(
      new URL("/cli/sign-in-failed", resource).href
    )
  })

  it("http: a pp with a different catalog is told to upgrade before anything runs", async () => {
    const headers = new Headers({
      "content-type": "application/json",
      authorization: `Bearer ${cliTokens[0]}`,
      "pp-catalog-version": "00000000"
    })
    const response = await nextHandler()(
      new Request(new URL("/api/v1/tools/me", resource).href, {
        method: "POST",
        headers,
        body: "{}"
      })
    )
    expect(response.status).toBe(409)
    const body = JSON.parse(await response.text())
    expect(body.error).toBe("CatalogMismatch")
    expect(body.message).toContain("pp upgrade")
  })

  it("http: the server serves an installer that signs in to it", async () => {
    const response = await nextHandler()(
      new Request(new URL("/api/cli/install.sh", resource).href)
    )
    expect(response.status).toBe(200)
    const script = await response.text()
    expect(script).toContain(`PP_SERVER='${new URL(resource).origin}'`)
    expect(script).toContain("releases/latest/download/install.sh")
  })

  it("http: an MCP token can't call the tools route", async () => {
    const http = await httpTool(tokens[0], "me")
    expect(http.status).toBe(401)
  })

  it("mcp: a CLI token can't call /mcp", async () => {
    const { status } = await callTool(cliTokens[0], "me")
    expect(status).toBe(401)
  })

  it("auth: PP CLI is a built-in PKCE client limited to the tools resource", async () => {
    const { rows } = await pool.query(
      "SELECT name, require_pkce, token_endpoint_auth_method, redirect_uris FROM oauth_client WHERE client_id=$1",
      [cliOAuthClient.id]
    )
    expect(rows[0]).toEqual({
      name: cliOAuthClient.name,
      require_pkce: true,
      token_endpoint_auth_method: "none",
      redirect_uris: [cliOAuthClient.redirectUri]
    })
    const links = await pool.query(
      "SELECT resource_id FROM oauth_client_resource WHERE client_id=$1",
      [cliOAuthClient.id]
    )
    expect(links.rows).toEqual([{ resource_id: toolsResource }])
  })

  it("http: revoking the CLI's consent signs it out", async () => {
    expect((await httpTool(cliTokens[1], "me")).status).toBe(200)
    await pool.query("DELETE FROM oauth_provider_consent WHERE id=$1", [
      cliConsentIds[1]
    ])
    const http = await httpTool(cliTokens[1], "me")
    expect(http.status).toBe(401)
    expect(http.body.message).toContain("pp login")
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

  describe("after the client is disabled", () => {
    it("auth: disabling the OAuth client locks its tokens out", async () => {
      await pool.query(
        "UPDATE oauth_client SET disabled=true WHERE client_id=$1",
        [clientId]
      )
      expect((await modern(tokens[1], "tools/list")).status).toBe(401)
      await pool.query(
        "UPDATE oauth_client SET disabled=false WHERE client_id=$1",
        [clientId]
      )
      expect((await modern(tokens[1], "tools/list")).status).toBe(200)
    })
  })

  describe("after a ban", () => {
    it("auth: an expired ban lets the token through", async () => {
      await pool.query(
        "UPDATE \"user\" SET banned=true, ban_expires=now() - interval '1 day' WHERE id=$1",
        [userIds[1]]
      )
      const { status } = await modern(tokens[1], "tools/list")
      expect(status).toBe(200)
    })

    it("auth: banning a user locks their token out", async () => {
      await pool.query(
        'UPDATE "user" SET banned=true, ban_expires=NULL WHERE id=$1',
        [userIds[1]]
      )
      const { status } = await modern(tokens[1], "tools/list")
      expect(status).toBe(403)
    })
  })
})
