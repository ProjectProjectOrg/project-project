import { createHash, randomUUID } from "node:crypto"
// @effect-diagnostics-next-line nodeBuiltinImport:off
import { mkdtemp, readFile, rm } from "node:fs/promises"
// @effect-diagnostics-next-line nodeBuiltinImport:off
import { createServer, type Server } from "node:http"
import { tmpdir } from "node:os"
// @effect-diagnostics-next-line nodeBuiltinImport:off
import { join } from "node:path"

import { requireMcpAuth } from "@better-auth/mcp"
import { migrationsFolder } from "@pp/db"
import { appOAuthClientId, appOAuthRedirectUri } from "@pp/shared"
import { betterAuth } from "better-auth"
import { makeSignature } from "better-auth/crypto"
import { toNodeHandler } from "better-auth/node"
import { drizzle } from "drizzle-orm/node-postgres"
import { migrate } from "drizzle-orm/node-postgres/migrator"
import { Layer, Schema } from "effect"
import * as Context from "effect/Context"
import { HttpRouter, HttpServer } from "effect/unstable/http"
import { Pool } from "pg"
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest"

vi.mock("../auth/cimdTransport", () => ({
  fetchClientMetadataResource: vi.fn()
}))

const httpFetch = globalThis.fetch.bind(globalThis)

const databaseUrl = process.env.PROJECTPROJECT_TEST_DATABASE_URL
const Client = Schema.Struct({ client_id: Schema.String })
const Redirect = Schema.Struct({ url: Schema.String })
const decodeRedirect = Schema.decodeUnknownSync(Redirect)

const verifierFor = (flow: string) =>
  `app-client-pkce-verifier-${flow}-0123456789-abcdefghijklmnopqrstuvwxyz`
const Token = Schema.Struct({
  access_token: Schema.String,
  refresh_token: Schema.String
})
const decodeToken = Schema.decodeUnknownSync(Token)

describe.skipIf(!databaseUrl)("MCP OAuth provider compatibility", () => {
  let server: Server
  let pool: Pool
  let baseUrl: string
  let auth: typeof import("../auth").auth
  let cookie: string
  let clientId: string | undefined
  let projectsDir: string
  let handleMcp: (request: Request) => Promise<Response>
  let disposeMcp = async () => {}
  let handleApi: (request: Request) => Promise<Response>
  let disposeApi = async () => {}
  const migratedClientId = randomUUID()
  const unrelatedClientId = randomUUID()
  const cimdClientId = "https://agent.example/oauth/client.json"
  const userId = randomUUID()
  const secret = "isolated-effect-v4-oauth-compatibility-test-secret"

  beforeAll(async () => {
    if (!databaseUrl) throw new Error("Test database URL is required")
    const url = new URL(databaseUrl)
    if (
      !["127.0.0.1", "localhost"].includes(url.hostname) ||
      !url.pathname.startsWith("/projectproject_effect_v4_")
    ) {
      throw new Error("OAuth tests require an isolated local test database")
    }
    pool = new Pool({ connectionString: databaseUrl })
    await migrate(drizzle({ client: pool }), {
      migrationsFolder
    })
    server = createServer()
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve))
    const address = server.address()
    if (!address || typeof address === "string")
      throw new Error("Missing test server address")
    baseUrl = `http://127.0.0.1:${address.port}`
    vi.stubEnv("DATABASE_URL", databaseUrl)
    vi.stubEnv("BETTER_AUTH_URL", baseUrl)
    vi.stubEnv("MCP_RESOURCE_URL", baseUrl)
    vi.stubEnv("BETTER_AUTH_SECRET", secret)
    projectsDir = await mkdtemp(
      join(tmpdir(), "projectproject-effect-v4-oauth-")
    )
    vi.stubEnv("PROJECTS_DIR", projectsDir)
    vi.stubEnv("GITHUB_APP_ID", "123")
    vi.stubEnv("GITHUB_APP_PRIVATE_KEY", "-----BEGIN PRIVATE KEY-----test")
    vi.stubEnv("GITHUB_APP_CLIENT_ID", "test")
    vi.stubEnv("GITHUB_APP_CLIENT_SECRET", "test")
    await pool.query(
      "INSERT INTO oauth_application (id, client_id, redirect_urls) VALUES ($1, $1, $2)",
      [migratedClientId, "http://127.0.0.1:15998/callback"]
    )
    await pool.query(
      `INSERT INTO oauth_client (id, client_id, redirect_uris, token_endpoint_auth_method, grant_types, response_types, require_pkce)
       VALUES ($1, $1, $2, 'none', $3, $4, true)`,
      [
        migratedClientId,
        ["http://127.0.0.1:15998/callback"],
        ["authorization_code", "refresh_token"],
        ["code"]
      ]
    )
    auth = (await import("../auth")).auth
    const { McpLive } = await import("../Layers/Mcp")
    const { BackendServicesLive, BackendInfrastructureLive } =
      await import("../runtime")
    const app = McpLive.pipe(
      Layer.provide(
        BackendServicesLive.pipe(Layer.provideMerge(BackendInfrastructureLive))
      )
    )
    const built = HttpRouter.toWebHandler(app, { disableLogger: true })
    handleMcp = built.handler
    disposeMcp = built.dispose
    const { ApiLive, ApiRouterLive } = await import("../main")
    const api = HttpRouter.toWebHandler(
      ApiLive.pipe(
        Layer.provide(ApiRouterLive),
        Layer.provide(BackendInfrastructureLive),
        Layer.provideMerge(HttpServer.layerServices)
      ),
      { disableLogger: true }
    )
    handleApi = (request) => api.handler(request, Context.empty() as never)
    disposeApi = api.dispose
    server.on("request", toNodeHandler(auth))
    await pool.query(
      'INSERT INTO "user" (id,name,email,email_verified,created_at,updated_at) VALUES ($1,$2,$3,true,now(),now())',
      [userId, "OAuth Test", `${userId}@example.test`]
    )
    const context = await auth.$context
    const session = await context.internalAdapter.createSession(userId)
    if (!session) throw new Error("Failed to create test session")
    cookie = `better-auth.session_token=${encodeURIComponent(`${session.token}.${await makeSignature(session.token, secret)}`)}`
  })

  afterAll(async () => {
    const results = await Promise.allSettled([
      disposeMcp(),
      disposeApi(),
      projectsDir
        ? rm(projectsDir, { recursive: true, force: true })
        : Promise.resolve(),
      (async () => {
        if (!pool) return
        try {
          const deletions = await Promise.allSettled([
            pool.query(
              "DELETE FROM oauth_client WHERE client_id IN ($1, $2, $3, $4)",
              [clientId, unrelatedClientId, migratedClientId, cimdClientId]
            ),
            pool.query("DELETE FROM oauth_application WHERE client_id=$1", [
              migratedClientId
            ]),
            pool.query('DELETE FROM "user" WHERE id=$1', [userId])
          ])
          for (const result of deletions)
            if (result.status === "rejected") throw result.reason
        } finally {
          await pool.end()
        }
      })(),
      server
        ? new Promise<void>((resolve, reject) =>
            server.close((error) => (error ? reject(error) : resolve()))
          )
        : Promise.resolve()
    ])
    vi.unstubAllEnvs()
    const errors = results.flatMap((result) =>
      result.status === "rejected" ? [result.reason] : []
    )
    if (errors.length)
      throw new AggregateError(errors, "OAuth test cleanup failed")
  }, 30_000)

  it("links migrated clients once across repeated auth initialization", async () => {
    const before = await pool.query(
      "SELECT id, resource_id FROM oauth_client_resource WHERE client_id=$1",
      [migratedClientId]
    )
    expect(before.rows).toEqual([
      { id: expect.any(String), resource_id: `${baseUrl}/mcp` }
    ])
    await betterAuth({
      ...auth.options,
      plugins: auth.options.plugins.filter((plugin) => plugin.id !== "cimd")
    }).$context
    const after = await pool.query(
      "SELECT id, resource_id FROM oauth_client_resource WHERE client_id=$1",
      [migratedClientId]
    )
    expect(after.rows).toEqual(before.rows)
  })

  it("migrates malformed legacy metadata without copying clients missing redirects", async () => {
    const migration = await readFile(
      `${migrationsFolder}/20260907091000_better_auth_17/migration.sql`,
      "utf8"
    )
    const backfill = migration
      .split("--> statement-breakpoint")
      .find((statement) => statement.includes('INSERT INTO "oauth_client"'))
    if (!backfill) throw new Error("Missing client backfill")
    const connection = await pool.connect()
    try {
      await connection.query("BEGIN")
      await connection.query(
        "CREATE TEMP TABLE oauth_application (LIKE public.oauth_application INCLUDING ALL) ON COMMIT DROP"
      )
      await connection.query(
        "CREATE TEMP TABLE oauth_client (LIKE public.oauth_client INCLUDING ALL) ON COMMIT DROP"
      )
      await connection.query(`INSERT INTO oauth_application (id, client_id, redirect_urls, metadata) VALUES
        ('valid', 'valid', 'http://localhost/callback', '{"ok":true}'),
        ('malformed', 'malformed', 'http://localhost/callback', '{broken'),
        ('null', 'null', NULL, NULL),
        ('empty', 'empty', '', ''),
        ('whitespace', 'whitespace', '  ', '')`)
      await connection.query(backfill)
      const result = await connection.query(
        "SELECT id, metadata, redirect_uris FROM oauth_client ORDER BY id"
      )
      expect(result.rows).toEqual([
        {
          id: "malformed",
          metadata: { legacy: "{broken" },
          redirect_uris: ["http://localhost/callback"]
        },
        {
          id: "valid",
          metadata: { ok: true },
          redirect_uris: ["http://localhost/callback"]
        }
      ])
    } finally {
      await connection.query("ROLLBACK")
      connection.release()
    }
  })

  it("discovers, registers, and reauthorizes migrated clients with resource-bound PKCE tokens", async () => {
    const discovery = await httpFetch(
      `${baseUrl}/.well-known/oauth-authorization-server/api/auth`
    )
    expect(discovery.status).toBe(200)
    const metadata = Schema.decodeUnknownSync(
      Schema.Struct({
        authorization_endpoint: Schema.String,
        token_endpoint: Schema.String,
        registration_endpoint: Schema.String
      })
    )(await discovery.json())
    expect(metadata.authorization_endpoint).toBe(
      `${baseUrl}/api/auth/oauth2/authorize`
    )
    const resource = `${baseUrl}/mcp`
    const resourceMetadata = await httpFetch(
      `${baseUrl}/.well-known/oauth-protected-resource/mcp`
    )
    expect(resourceMetadata.status).toBe(200)
    const protectedMetadata = Schema.decodeUnknownSync(
      Schema.Struct({
        resource: Schema.String,
        authorization_servers: Schema.Array(Schema.String)
      })
    )(await resourceMetadata.json())
    expect(protectedMetadata.resource).toBe(resource)
    expect(protectedMetadata.authorization_servers).toContain(
      `${baseUrl}/api/auth`
    )
    const registration = await httpFetch(metadata.registration_endpoint, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        client_name: "Migration test",
        application_type: "native",
        redirect_uris: ["http://127.0.0.1:15998/callback"],
        token_endpoint_auth_method: "none",
        grant_types: ["authorization_code", "refresh_token"],
        response_types: ["code"]
      })
    })
    expect(registration.status, await registration.clone().text()).toBe(201)
    clientId = Schema.decodeUnknownSync(Client)(
      await registration.json()
    ).client_id
    await pool.query(
      "INSERT INTO oauth_client (id, client_id, redirect_uris, user_id) VALUES ($1, $1, $2, $3)",
      [unrelatedClientId, ["http://localhost/unrelated"], userId]
    )
    await pool.query(
      "INSERT INTO oauth_provider_consent (id, client_id, user_id, scopes, created_at, updated_at) VALUES ($1, $1, $2, $3, now(), now())",
      [unrelatedClientId, userId, ["openid"]]
    )
    const registrationMapping = await pool.query(
      "SELECT resource_id FROM oauth_client_resource WHERE client_id=$1",
      [clientId]
    )
    expect(registrationMapping.rows).toEqual([{ resource_id: resource }])
    await pool.query("DELETE FROM oauth_client WHERE client_id=$1", [clientId])
    clientId = migratedClientId
    const verifier =
      "effect-v4-migration-pkce-verifier-0123456789-abcdefghijklmnopqrstuvwxyz"
    const query = new URLSearchParams({
      client_id: clientId,
      redirect_uri: "http://127.0.0.1:15998/callback",
      response_type: "code",
      scope: "openid profile offline_access",
      resource,
      state: "roundtrip-state",
      code_challenge_method: "S256",
      code_challenge: createHash("sha256").update(verifier).digest("base64url")
    })
    const authorization = await auth.handler(
      new Request(`${metadata.authorization_endpoint}?${query.toString()}`, {
        headers: {
          cookie,
          accept: "text/html",
          "sec-fetch-mode": "navigate",
          "sec-fetch-dest": "document"
        }
      })
    )
    expect(authorization.status).toBe(302)
    const consentUrl = new URL(authorization.headers.get("location")!, baseUrl)
    expect(consentUrl.pathname).toBe("/oauth/consent")
    expect(consentUrl.searchParams.has("sig")).toBe(true)
    const tampered = await httpFetch(`${baseUrl}/api/auth/oauth2/consent`, {
      method: "POST",
      headers: { "content-type": "application/json", cookie, origin: baseUrl },
      body: JSON.stringify({
        accept: true,
        oauth_query: `${consentUrl.search.slice(1)}&scope=admin`
      })
    })
    expect(tampered.status, await tampered.clone().text()).toBe(400)
    const consent = await httpFetch(`${baseUrl}/api/auth/oauth2/consent`, {
      method: "POST",
      headers: { "content-type": "application/json", cookie, origin: baseUrl },
      body: JSON.stringify({
        accept: true,
        oauth_query: consentUrl.search.slice(1)
      })
    })
    expect(consent.status).toBe(200)
    const callback = new URL(decodeRedirect(await consent.json()).url)
    expect(callback.searchParams.get("state")).toBe("roundtrip-state")
    const code = callback.searchParams.get("code")
    expect(code).toBeTruthy()
    const tokenBody = new URLSearchParams({
      grant_type: "authorization_code",
      client_id: clientId,
      code: code!,
      redirect_uri: "http://127.0.0.1:15998/callback",
      code_verifier: verifier,
      resource
    })
    const tokenResponse = await httpFetch(metadata.token_endpoint, {
      method: "POST",
      body: tokenBody
    })
    expect(tokenResponse.status, await tokenResponse.clone().text()).toBe(200)
    const token = decodeToken(await tokenResponse.json())
    const protectedHandler = requireMcpAuth(
      auth,
      async (_request, claims) => {
        expect(claims.pp_consent_ids).not.toContain(unrelatedClientId)
        expect(claims.pp_consent_ids).toHaveLength(1)
        return Response.json({ userId: claims.sub })
      },
      { resource }
    )
    const protectedResponse = await protectedHandler(
      new Request(resource, {
        headers: { authorization: `Bearer ${token.access_token}` }
      })
    )
    expect(protectedResponse.status).toBe(200)
    expect(await protectedResponse.json()).toEqual({ userId })
    const wrongResource = requireMcpAuth(
      auth,
      async () => new Response("wrong resource"),
      { resource: `${baseUrl}/another-resource` }
    )
    expect(
      (
        await wrongResource(
          new Request(resource, {
            headers: { authorization: `Bearer ${token.access_token}` }
          })
        )
      ).status
    ).toBe(401)
    const listTools = () =>
      handleMcp(
        new Request(resource, {
          method: "POST",
          headers: {
            authorization: `Bearer ${token.access_token}`,
            "content-type": "application/json",
            accept: "application/json, text/event-stream",
            "mcp-protocol-version": "2026-07-28",
            "mcp-method": "tools/list"
          },
          body: JSON.stringify({
            jsonrpc: "2.0",
            id: 1,
            method: "tools/list",
            params: {
              _meta: {
                "io.modelcontextprotocol/protocolVersion": "2026-07-28",
                "io.modelcontextprotocol/clientInfo": {
                  name: "test",
                  version: "1"
                },
                "io.modelcontextprotocol/clientCapabilities": {}
              }
            }
          })
        })
      )
    expect((await listTools()).status).toBe(200)
    const apiWithMcpToken = await handleApi(
      new Request(`${baseUrl}/api/me`, {
        headers: { authorization: `Bearer ${token.access_token}` }
      })
    )
    expect(apiWithMcpToken.status).toBe(401)
    await pool.query(
      "UPDATE oauth_provider_consent SET id=$1 WHERE user_id=$2 AND client_id=$3",
      [randomUUID(), userId, clientId]
    )
    const revoked = await listTools()
    expect(revoked.status).toBe(401)
    expect(revoked.headers.get("www-authenticate")).toBe(
      `Bearer resource_metadata="${baseUrl}/.well-known/oauth-protected-resource/mcp"`
    )
    const refreshBody = new URLSearchParams({
      grant_type: "refresh_token",
      client_id: clientId,
      refresh_token: token.refresh_token,
      resource
    })
    const refreshed = await httpFetch(metadata.token_endpoint, {
      method: "POST",
      body: refreshBody
    })
    expect(refreshed.status, await refreshed.clone().text()).toBe(200)
    const rotated = decodeToken(await refreshed.json())
    expect(rotated.refresh_token).not.toBe(token.refresh_token)
    // Within `refreshTokenReuseInterval` a retried refresh replays the rotated
    // response instead of tripping breach detection, which would delete every
    // refresh token for this client/user pair.
    const refreshReplay = await httpFetch(metadata.token_endpoint, {
      method: "POST",
      body: refreshBody
    })
    expect(refreshReplay.status, await refreshReplay.clone().text()).toBe(200)
    const replayed = decodeToken(await refreshReplay.json())
    expect(replayed.refresh_token).toBe(rotated.refresh_token)
    const replay = await httpFetch(metadata.token_endpoint, {
      method: "POST",
      body: tokenBody
    })
    expect(replay.status).toBe(400)
  })

  it("asks for consent on every authorization of the built-in app client", async () => {
    const seeded = await pool.query(
      "SELECT redirect_uris, token_endpoint_auth_method, require_pkce, skip_consent FROM oauth_client WHERE client_id=$1",
      [appOAuthClientId]
    )
    expect(seeded.rows).toEqual([
      {
        redirect_uris: [appOAuthRedirectUri],
        token_endpoint_auth_method: "none",
        require_pkce: true,
        skip_consent: false
      }
    ])
    const parameters = (
      flow: string,
      extra: Readonly<Record<string, string>> = {}
    ) =>
      new URLSearchParams({
        client_id: appOAuthClientId,
        redirect_uri: appOAuthRedirectUri,
        response_type: "code",
        scope: "openid profile offline_access",
        state: `state-${flow}`,
        code_challenge_method: "S256",
        code_challenge: createHash("sha256")
          .update(verifierFor(flow))
          .digest("base64url"),
        ...extra
      })
    const navigation = {
      cookie,
      accept: "text/html",
      "sec-fetch-mode": "navigate",
      "sec-fetch-dest": "document"
    }
    const authorize = (
      flow: string,
      extra: Readonly<Record<string, string>> = {}
    ) =>
      auth.handler(
        new Request(
          `${baseUrl}/api/auth/oauth2/authorize?${parameters(flow, extra).toString()}`,
          { headers: navigation }
        )
      )
    const consentPage = (response: Response) => {
      expect(response.status).toBe(302)
      const location = new URL(response.headers.get("location")!, baseUrl)
      expect(location.pathname).toBe("/oauth/consent")
      return location.search.slice(1)
    }
    const accept = async (oauthQuery: string) => {
      const consent = await httpFetch(`${baseUrl}/api/auth/oauth2/consent`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          cookie,
          origin: baseUrl
        },
        body: JSON.stringify({ accept: true, oauth_query: oauthQuery })
      })
      expect(consent.status, await consent.clone().text()).toBe(200)
      return new URL(decodeRedirect(await consent.json()).url)
    }

    const callback = await accept(consentPage(await authorize("first")))
    expect(`${callback.protocol}//${callback.host}${callback.pathname}`).toBe(
      appOAuthRedirectUri
    )
    expect(callback.searchParams.get("state")).toBe("state-first")

    const replayed = await authorize("first", { prompt: "none" })
    expect(replayed.status).toBe(302)
    const replayedRedirect = new URL(replayed.headers.get("location")!)
    expect(replayedRedirect.searchParams.get("error")).toBe("consent_required")
    expect(replayedRedirect.searchParams.has("code")).toBe(false)
    consentPage(await authorize("first"))
    consentPage(await authorize("second"))
    consentPage(await authorize("forged", { sig: "forged-signature" }))
    const silent = await authorize("silent", { prompt: "none" })
    expect(silent.status).toBe(302)
    const silentRedirect = new URL(silent.headers.get("location")!)
    expect(silentRedirect.searchParams.get("error")).toBe("consent_required")
    expect(silentRedirect.searchParams.has("code")).toBe(false)
    const posted = await auth.handler(
      new Request(`${baseUrl}/api/auth/oauth2/authorize`, {
        method: "POST",
        headers: {
          ...navigation,
          origin: baseUrl,
          "content-type": "application/x-www-form-urlencoded"
        },
        body: parameters("posted")
      })
    )
    const postedLocation = posted.headers.get("location") ?? ""
    expect(postedLocation).not.toContain("code=")
    expect(await posted.clone().text()).not.toContain("code=")

    const tokenResponse = await httpFetch(`${baseUrl}/api/auth/oauth2/token`, {
      method: "POST",
      body: new URLSearchParams({
        grant_type: "authorization_code",
        client_id: appOAuthClientId,
        code: callback.searchParams.get("code")!,
        redirect_uri: appOAuthRedirectUri,
        code_verifier: verifierFor("first")
      })
    })
    expect(tokenResponse.status, await tokenResponse.clone().text()).toBe(200)
    const token = decodeToken(await tokenResponse.json())
    await pool.query(
      "UPDATE oauth_refresh_token SET expires_at = now() + interval '1 day' WHERE client_id=$1 AND user_id=$2",
      [appOAuthClientId, userId]
    )
    const refreshed = await httpFetch(`${baseUrl}/api/auth/oauth2/token`, {
      method: "POST",
      body: new URLSearchParams({
        grant_type: "refresh_token",
        client_id: appOAuthClientId,
        refresh_token: token.refresh_token
      })
    })
    expect(refreshed.status, await refreshed.clone().text()).toBe(200)
    const refresh = await pool.query(
      "SELECT max(extract(epoch FROM expires_at - now()) / 86400) AS days FROM oauth_refresh_token WHERE client_id=$1 AND user_id=$2 AND revoked IS NULL",
      [appOAuthClientId, userId]
    )
    expect(Number(refresh.rows[0].days)).toBeCloseTo(90, 0)
  })

  it("accepts app access tokens on /api independently of the web session", async () => {
    const resource = `${baseUrl}/api`
    const verifier =
      "app-client-api-pkce-verifier-0123456789-abcdefghijklmnopqrstuvwxyz"
    const query = new URLSearchParams({
      client_id: appOAuthClientId,
      redirect_uri: appOAuthRedirectUri,
      response_type: "code",
      scope: "openid profile offline_access",
      state: "api-state",
      resource,
      code_challenge_method: "S256",
      code_challenge: createHash("sha256").update(verifier).digest("base64url")
    })
    const context = await auth.$context
    const session = await context.internalAdapter.createSession(userId)
    if (!session) throw new Error("Failed to create test session")
    const appSessionCookie = `better-auth.session_token=${encodeURIComponent(`${session.token}.${await makeSignature(session.token, secret)}`)}`
    const authorization = await auth.handler(
      new Request(`${baseUrl}/api/auth/oauth2/authorize?${query.toString()}`, {
        headers: {
          cookie: appSessionCookie,
          accept: "text/html",
          "sec-fetch-mode": "navigate",
          "sec-fetch-dest": "document"
        }
      })
    )
    expect(authorization.status).toBe(302)
    const consentUrl = new URL(authorization.headers.get("location")!, baseUrl)
    expect(consentUrl.pathname).toBe("/oauth/consent")
    const consent = await httpFetch(`${baseUrl}/api/auth/oauth2/consent`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        cookie: appSessionCookie,
        origin: baseUrl
      },
      body: JSON.stringify({
        accept: true,
        oauth_query: consentUrl.search.slice(1)
      })
    })
    expect(consent.status, await consent.clone().text()).toBe(200)
    const code = new URL(
      Schema.decodeUnknownSync(Redirect)(await consent.json()).url
    ).searchParams.get("code")
    expect(code).toBeTruthy()
    const tokenResponse = await httpFetch(`${baseUrl}/api/auth/oauth2/token`, {
      method: "POST",
      body: new URLSearchParams({
        grant_type: "authorization_code",
        client_id: appOAuthClientId,
        code: code!,
        redirect_uri: appOAuthRedirectUri,
        code_verifier: verifier,
        resource
      })
    })
    expect(tokenResponse.status, await tokenResponse.clone().text()).toBe(200)
    const token = Schema.decodeUnknownSync(Token)(await tokenResponse.json())
    const me = (headers: Readonly<Record<string, string>>) =>
      handleApi(new Request(`${baseUrl}/api/me`, { headers }))
    const Me = Schema.Struct({ id: Schema.String })
    const bearer = { authorization: `Bearer ${token.access_token}` }

    const viaBearer = await me(bearer)
    expect(viaBearer.status, await viaBearer.clone().text()).toBe(200)
    expect(Schema.decodeUnknownSync(Me)(await viaBearer.json()).id).toBe(userId)

    await pool.query("DELETE FROM session WHERE token=$1", [session.token])
    expect((await me(bearer)).status).toBe(200)

    const staleCookie = await me({
      ...bearer,
      cookie: "better-auth.session_token=stale.signature"
    })
    expect(staleCookie.status).toBe(200)
    expect(Schema.decodeUnknownSync(Me)(await staleCookie.json()).id).toBe(
      userId
    )

    const orgs = await handleApi(
      new Request(`${baseUrl}/api/orgs`, { headers: bearer })
    )
    expect(orgs.status, await orgs.clone().text()).toBe(200)
    const invitations = await handleApi(
      new Request(`${baseUrl}/api/invitations`, { headers: bearer })
    )
    expect(invitations.status).toBe(401)

    const mcpWithApiToken = await handleMcp(
      new Request(`${baseUrl}/mcp`, {
        method: "POST",
        headers: {
          ...bearer,
          "content-type": "application/json",
          accept: "application/json, text/event-stream"
        },
        body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/list" })
      })
    )
    expect(mcpWithApiToken.status).toBe(401)

    const invalid = await me({ authorization: "Bearer not-a-token" })
    expect(invalid.status).toBe(401)
    expect(invalid.headers.get("www-authenticate")).toBe("Bearer")

    const viaCookie = await me({ cookie })
    expect(viaCookie.status).toBe(200)
    expect(Schema.decodeUnknownSync(Me)(await viaCookie.json()).id).toBe(userId)

    await pool.query(
      "UPDATE oauth_provider_consent SET id=gen_random_uuid()::text WHERE user_id=$1 AND client_id=$2",
      [userId, appOAuthClientId]
    )
    expect((await me(bearer)).status).toBe(401)
  })

  it("advertises Client ID Metadata Document support", async () => {
    const response = await httpFetch(
      `${baseUrl}/.well-known/oauth-authorization-server/api/auth`
    )
    expect(response.status).toBe(200)
    const metadata = Schema.decodeUnknownSync(
      Schema.Struct({ client_id_metadata_document_supported: Schema.Boolean })
    )(await response.json())
    expect(metadata.client_id_metadata_document_supported).toBe(true)
  })

  it("accepts an HTTPS metadata URL as client_id", async () => {
    const { fetchClientMetadataResource } =
      await import("../auth/cimdTransport")
    vi.mocked(fetchClientMetadataResource).mockImplementation(
      async () =>
        new Response(
          JSON.stringify({
            client_id: cimdClientId,
            client_name: "CIMD test agent",
            redirect_uris: ["http://127.0.0.1:15999/callback"],
            grant_types: ["authorization_code", "refresh_token"],
            response_types: ["code"],
            token_endpoint_auth_method: "none"
          }),
          { status: 200, headers: { "content-type": "application/json" } }
        )
    )
    const verifier = randomUUID()
    const challenge = createHash("sha256").update(verifier).digest("base64url")
    const authorize = new URL(`${baseUrl}/api/auth/oauth2/authorize`)
    authorize.searchParams.set("client_id", cimdClientId)
    authorize.searchParams.set(
      "redirect_uri",
      "http://127.0.0.1:15999/callback"
    )
    authorize.searchParams.set("response_type", "code")
    authorize.searchParams.set("scope", "openid")
    authorize.searchParams.set("code_challenge", challenge)
    authorize.searchParams.set("code_challenge_method", "S256")
    authorize.searchParams.set("resource", `${baseUrl}/mcp`)
    const response = await httpFetch(authorize, {
      headers: {
        cookie,
        accept: "text/html",
        "sec-fetch-mode": "navigate",
        "sec-fetch-dest": "document"
      },
      redirect: "manual"
    })
    expect([200, 302]).toContain(response.status)
    const location = response.headers.get("location") ?? ""
    expect(location).not.toContain("error=")
    const stored = await pool.query(
      "SELECT name FROM oauth_client WHERE client_id=$1",
      [cimdClientId]
    )
    expect(stored.rows[0]?.name).toBe("CIMD test agent")
  })
})
