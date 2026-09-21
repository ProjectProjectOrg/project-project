import { afterAll, beforeAll, describe, expect, it, vi } from "vite-plus/test"
import { randomUUID } from "node:crypto"
import { Pool } from "pg"
import { drizzle } from "drizzle-orm/node-postgres"
import * as DateTime from "effect/DateTime"
import * as Effect from "effect/Effect"
import { invitation, member, organization, user } from "../db/auth-schema"
import { BetterAuth } from "../Services/BetterAuth"

const databaseUrl = process.env.PROJECTPROJECT_TEST_DATABASE_URL

describe.skipIf(!databaseUrl)("BetterAuth live", () => {
  const orgId = randomUUID()
  const inviterId = randomUUID()
  const ownerId = randomUUID()
  const targetId = randomUUID()
  const invitationIds = [randomUUID(), randomUUID()]
  const inviterEmail = `${inviterId}@example.test`
  const ownerEmail = `${ownerId}@example.test`
  const recipientEmail = `${randomUUID()}@example.test`
  const orgSlug = `invitation-test-${orgId}`
  const transferTriggerName = `test_transfer_failure_${randomUUID().replaceAll("-", "")}`
  const transferFunctionName = `${transferTriggerName}_fn`
  let pool: Pool
  let auth: typeof import("../auth").auth
  let betterAuthLive: typeof import("./BetterAuth").BetterAuthLive

  beforeAll(async () => {
    if (!databaseUrl) throw new Error("Test database URL is required")
    const url = new URL(databaseUrl)
    if (
      !["127.0.0.1", "localhost"].includes(url.hostname) ||
      !url.pathname.startsWith("/projectproject_effect_v4_")
    ) {
      throw new Error(
        "BetterAuth live tests require an isolated local test database"
      )
    }

    process.env.DATABASE_URL = databaseUrl
    process.env.BETTER_AUTH_SECRET ??= "isolated-effect-v4-live-test-secret"
    process.env.BETTER_AUTH_URL ??= "http://localhost:15999"
    pool = new Pool({ connectionString: databaseUrl })
    const db = drizzle({ client: pool })
    await db.insert(user).values({
      id: inviterId,
      name: "Invitation Sender",
      email: inviterEmail,
      emailVerified: true,
      createdAt: DateTime.toDate(DateTime.nowUnsafe()),
      updatedAt: DateTime.toDate(DateTime.nowUnsafe())
    })
    await db.insert(user).values([
      {
        id: ownerId,
        name: "Transfer Owner",
        email: ownerEmail,
        emailVerified: true,
        createdAt: DateTime.toDate(DateTime.nowUnsafe()),
        updatedAt: DateTime.toDate(DateTime.nowUnsafe())
      },
      {
        id: targetId,
        name: "Transfer Target",
        email: `${targetId}@example.test`,
        emailVerified: true,
        createdAt: DateTime.toDate(DateTime.nowUnsafe()),
        updatedAt: DateTime.toDate(DateTime.nowUnsafe())
      }
    ])
    await db.insert(organization).values({
      id: orgId,
      name: "Invitation Test Org",
      slug: orgSlug,
      createdAt: DateTime.toDate(DateTime.nowUnsafe())
    })
    await db.insert(member).values([
      {
        id: randomUUID(),
        organizationId: orgId,
        userId: ownerId,
        role: "owner",
        createdAt: DateTime.toDate(DateTime.nowUnsafe())
      },
      {
        id: randomUUID(),
        organizationId: orgId,
        userId: targetId,
        role: "admin",
        createdAt: DateTime.toDate(DateTime.nowUnsafe())
      }
    ])

    ;({ auth } = await import("../auth"))
    ;({ BetterAuthLive: betterAuthLive } = await import("./BetterAuth"))
  })

  afterAll(async () => {
    if (!pool) return
    await pool.query('DELETE FROM "invitation" WHERE id = ANY($1)', [
      invitationIds
    ])
    await pool.query('DELETE FROM "organization" WHERE id = $1', [orgId])
    await pool.query(
      `DROP TRIGGER IF EXISTS "${transferTriggerName}" ON "member"`
    )
    await pool.query(`DROP FUNCTION IF EXISTS "${transferFunctionName}"()`)
    await pool.query('DELETE FROM "user" WHERE id = ANY($1)', [
      [inviterId, ownerId, targetId]
    ])
    await pool.query('DELETE FROM "user" WHERE email = $1', [recipientEmail])
    await pool.end()
  })

  it("omits expired pending invitations from the live list", async () => {
    let signInUrl = ""
    const writeSpy = vi
      .spyOn(process.stdout, "write")
      .mockImplementation((chunk: string | Uint8Array) => {
        const text = String(chunk)
        if (text.includes("[magic-link]")) signInUrl = text
        return true
      })

    try {
      const signIn = await auth.api.signInMagicLink({
        body: { email: recipientEmail },
        headers: new Headers({ origin: "http://localhost:15999" })
      })
      expect(signIn.status).toBe(true)
      const url = signInUrl.match(/url=(?<url>\S+)/)?.groups?.url
      expect(url).toBeDefined()
      const response = await auth.handler(new Request(url!))
      const cookie = response.headers
        .getSetCookie()
        .map((value) => value.split(";")[0])
        .join("; ")
      const request = new Request("http://localhost:15999/api/auth", {
        headers: { cookie, origin: "http://localhost:15999" }
      })

      const recipient = await auth.api.getSession({
        asResponse: false,
        headers: request.headers,
        request
      })
      expect(recipient).toMatchObject({ user: { email: recipientEmail } })
      if (!recipient) throw new Error("Magic-link session was not created")

      const db = drizzle({ client: pool })
      const now = DateTime.nowUnsafe()
      await db.insert(invitation).values([
        {
          id: invitationIds[0],
          organizationId: orgId,
          email: recipientEmail,
          role: "member",
          status: "pending",
          expiresAt: DateTime.toDate(DateTime.add(now, { days: -1 })),
          inviterId
        },
        {
          id: invitationIds[1],
          organizationId: orgId,
          email: recipientEmail,
          role: "member",
          status: "pending",
          expiresAt: DateTime.toDate(DateTime.add(now, { days: 1 })),
          inviterId
        }
      ])

      const service = await Effect.runPromise(
        Effect.gen(function* () {
          const betterAuth = yield* BetterAuth
          return yield* betterAuth.listInvitations(request)
        }).pipe(Effect.provide(betterAuthLive))
      )
      expect(service.map((entry) => entry.id)).toEqual([invitationIds[1]])
    } finally {
      writeSpy.mockRestore()
    }
  })

  it("rolls back a transfer when the second role write fails", async () => {
    let signInUrl = ""
    const writeSpy = vi
      .spyOn(process.stdout, "write")
      .mockImplementation((chunk: string | Uint8Array) => {
        const text = String(chunk)
        if (text.includes("[magic-link]")) signInUrl = text
        return true
      })

    try {
      await pool.query(`
        CREATE FUNCTION "${transferFunctionName}"() RETURNS trigger
        LANGUAGE plpgsql AS $$
        BEGIN
          IF NEW.user_id = '${ownerId}' AND NEW.role = 'admin' THEN
            RAISE EXCEPTION 'forced transfer failure';
          END IF;
          RETURN NEW;
        END;
        $$
      `)
      await pool.query(`
        CREATE TRIGGER "${transferTriggerName}"
        BEFORE UPDATE ON "member"
        FOR EACH ROW EXECUTE FUNCTION "${transferFunctionName}"()
      `)

      const signIn = await auth.api.signInMagicLink({
        body: { email: ownerEmail },
        headers: new Headers({ origin: "http://localhost:15999" })
      })
      expect(signIn.status).toBe(true)
      const url = signInUrl.match(/url=(?<url>\S+)/)?.groups?.url
      expect(url).toBeDefined()
      const response = await auth.handler(new Request(url!))
      const cookie = response.headers
        .getSetCookie()
        .map((value) => value.split(";")[0])
        .join("; ")
      const request = new Request("http://localhost:15999/api/auth", {
        headers: { cookie, origin: "http://localhost:15999" }
      })

      const exit = await Effect.runPromiseExit(
        Effect.gen(function* () {
          const betterAuth = yield* BetterAuth
          return yield* betterAuth.transferOwnership(
            request,
            orgSlug,
            targetId,
            ownerId
          )
        }).pipe(Effect.provide(betterAuthLive))
      )
      expect(exit._tag).toBe("Failure")
      expect(String(exit)).toContain("forced transfer failure")

      await pool.query(
        `DROP TRIGGER IF EXISTS "${transferTriggerName}" ON "member"`
      )
      await pool.query(`DROP FUNCTION IF EXISTS "${transferFunctionName}"()`)

      const transferred = await Effect.runPromise(
        Effect.gen(function* () {
          const betterAuth = yield* BetterAuth
          return yield* betterAuth.transferOwnership(
            request,
            orgSlug,
            targetId,
            ownerId
          )
        }).pipe(Effect.provide(betterAuthLive))
      )
      expect(
        transferred.members.map((entry) => [entry.userId, entry.role])
      ).toEqual(
        expect.arrayContaining([
          [ownerId, "admin"],
          [targetId, "owner"]
        ])
      )

      const rows = await pool.query(
        'SELECT user_id, role FROM "member" WHERE organization_id = $1 ORDER BY user_id',
        [orgId]
      )
      expect(rows.rows).toEqual(
        expect.arrayContaining([
          { user_id: ownerId, role: "admin" },
          { user_id: targetId, role: "owner" }
        ])
      )

      const rejected = await Effect.runPromiseExit(
        Effect.gen(function* () {
          const betterAuth = yield* BetterAuth
          return yield* betterAuth.transferOwnership(
            request,
            orgSlug,
            targetId,
            ownerId
          )
        }).pipe(Effect.provide(betterAuthLive))
      )
      expect(rejected._tag).toBe("Failure")
      expect(JSON.stringify(rejected)).toContain(
        "YOU_ARE_NOT_ALLOWED_TO_UPDATE_THIS_MEMBER"
      )
    } finally {
      writeSpy.mockRestore()
      await pool.query(
        `DROP TRIGGER IF EXISTS "${transferTriggerName}" ON "member"`
      )
      await pool.query(`DROP FUNCTION IF EXISTS "${transferFunctionName}"()`)
    }
  })
})
