import { randomBytes, randomUUID } from "node:crypto"
import { inspect } from "node:util"

import { PgClient } from "@effect/sql-pg"
import { it } from "@effect/vitest"
import { DbLive } from "@pp/db"
import {
  Forbidden,
  NotFound,
  OrgEmailError,
  type SaveOrgEmailInput
} from "@pp/shared"
import { drizzle } from "drizzle-orm/node-postgres"
import { migrate } from "drizzle-orm/node-postgres/migrator"
import * as Effect from "effect/Effect"
import * as Layer from "effect/Layer"
import * as Redacted from "effect/Redacted"
import { Pool } from "pg"
import { afterAll, beforeAll, describe, expect } from "vitest"

import { CurrentOrgLive } from "../organizations/CurrentOrgLive"
import { SecretCryptoLive } from "../storage/SecretCryptoLive"
import { OrgEmail } from "./OrgEmail"
import { Smtp, type SmtpConnection } from "./Smtp"

const databaseUrl = process.env.PROJECTPROJECT_TEST_DATABASE_URL
const settings: SaveOrgEmailInput = {
  host: "smtp.example.test",
  port: 587,
  security: "starttls",
  username: "test-user",
  password: "smtp-secret",
  senderName: "Test",
  senderEmail: "mail@example.test",
  replyTo: null
}

describe.skipIf(!databaseUrl)("organization email configuration", () => {
  let pool: Pool
  const orgId = randomUUID()
  const slug = `email-${orgId}`
  const adminId = randomUUID()
  const memberId = randomUUID()
  const oldKey = process.env.USER_SECRET_ENCRYPTION_KEY

  beforeAll(async () => {
    if (!databaseUrl) throw new Error("Missing test database")
    const url = new URL(databaseUrl)
    if (
      url.hostname !== "127.0.0.1" ||
      !url.pathname.startsWith("/projectproject_effect_v4_")
    )
      throw new Error("Isolated local database required")
    process.env.USER_SECRET_ENCRYPTION_KEY = randomBytes(32).toString("base64")
    pool = new Pool({ connectionString: databaseUrl })
    await migrate(drizzle({ client: pool }), {
      migrationsFolder: `${import.meta.dirname}/../../../db/src/migrations`
    })
    for (const id of [adminId, memberId])
      await pool.query(
        'insert into "user" (id, name, email, email_verified, created_at, updated_at) values ($1, $1, $2, true, now(), now())',
        [id, `${id}@example.test`]
      )
    await pool.query(
      "insert into organization (id, name, slug, created_at) values ($1, $2, $2, now())",
      [orgId, slug]
    )
    for (const [id, role] of [
      [adminId, "admin"],
      [memberId, "member"]
    ])
      await pool.query(
        "insert into member (id, organization_id, user_id, role, created_at) values ($1, $2, $3, $4, now())",
        [randomUUID(), orgId, id, role]
      )
  })
  afterAll(async () => {
    if (oldKey === undefined) delete process.env.USER_SECRET_ENCRYPTION_KEY
    else process.env.USER_SECRET_ENCRYPTION_KEY = oldKey
    await pool?.query("delete from organization where id = $1", [orgId])
    await pool?.query('delete from "user" where id = ANY($1)', [
      [adminId, memberId]
    ])
    await pool?.end()
  })
  const layer = (
    sendTest: (
      connection: SmtpConnection,
      recipient: string
    ) => Effect.Effect<void, OrgEmailError> = () => Effect.void
  ) =>
    OrgEmail.layer.pipe(
      Layer.provide(Layer.succeed(Smtp, { sendTest })),
      Layer.provide(SecretCryptoLive),
      Layer.provide(CurrentOrgLive),
      Layer.provide(
        DbLive.pipe(
          Layer.provide(
            PgClient.layer({ url: Redacted.make(databaseUrl ?? "") })
          )
        )
      )
    )

  it.effect(
    "encrypts passwords, preserves them on edits, records test results, and deletes credentials",
    () =>
      Effect.gen(function* () {
        const sent: Array<Readonly<{ password: string; recipient: string }>> =
          []
        yield* Effect.gen(function* () {
          const email = yield* OrgEmail
          const saved = yield* email.save(slug, adminId, settings)
          expect(inspect(saved)).not.toContain("smtp-secret")
          const { password: _password, ...patch } = settings
          yield* email.save(slug, adminId, { ...patch, senderName: "Updated" })
          const tested = yield* email.test(slug, adminId, "admin@example.test")
          expect(tested.lastTest?.error).toBeNull()
          expect(tested.lastTest?.at).toBeInstanceOf(Date)
          const updated = yield* email.save(slug, adminId, {
            ...patch,
            password: "new-secret"
          })
          expect(updated.lastTest).toBeNull()
        }).pipe(
          Effect.provide(
            layer((connection, recipient) =>
              Effect.sync(() => {
                sent.push({
                  password: Redacted.value(connection.password),
                  recipient
                })
              })
            )
          )
        )
        expect(sent).toEqual([
          { password: "smtp-secret", recipient: "admin@example.test" }
        ])
        const rows = yield* Effect.promise(() =>
          pool.query(
            "select * from organization_email where organization_id = $1",
            [orgId]
          )
        )
        expect(inspect(rows.rows)).not.toContain("new-secret")
        const failed = yield* Effect.flatMap(OrgEmail, (email) =>
          email.test(slug, adminId, "admin@example.test")
        ).pipe(
          Effect.provide(
            layer(() =>
              Effect.fail(new OrgEmailError({ reason: "authentication" }))
            )
          )
        )
        expect(failed.lastTest?.error).toBe("authentication")
        yield* Effect.flatMap(OrgEmail, (email) =>
          email.disconnect(slug, adminId)
        ).pipe(Effect.provide(layer()))
        const remaining = yield* Effect.promise(() =>
          pool.query(
            "select * from organization_email where organization_id = $1",
            [orgId]
          )
        )
        expect(remaining.rows).toHaveLength(0)
      })
  )

  it.effect("denies members and outsiders on every operation", () =>
    Effect.gen(function* () {
      const email = yield* OrgEmail
      for (const userId of [memberId, "outsider"]) {
        for (const operation of [
          email.get(slug, userId),
          email.save(slug, userId, settings),
          email.test(slug, userId, "ignored@example.test"),
          email.disconnect(slug, userId)
        ]) {
          const error = yield* Effect.flip(operation)
          expect(error).toBeInstanceOf(
            userId === memberId ? Forbidden : NotFound
          )
        }
      }
    }).pipe(Effect.provide(layer()))
  )

  it.effect("does not attach an old test result to changed settings", () => {
    const slowTest = layer(() =>
      Effect.flatMap(OrgEmail.pipe(Effect.provide(layer())), (email) =>
        email.save(slug, adminId, { ...settings, host: "changed.example.test" })
      ).pipe(Effect.asVoid, Effect.orDie)
    )
    return Effect.gen(function* () {
      const email = yield* OrgEmail
      yield* email.save(slug, adminId, settings)
      const error = yield* Effect.flip(
        email.test(slug, adminId, "admin@example.test")
      )
      expect(error).toEqual(new OrgEmailError({ reason: "settings_changed" }))
      const current = yield* email.get(slug, adminId)
      expect(current.settings?.host).toBe("changed.example.test")
      expect(current.lastTest).toBeNull()
    }).pipe(Effect.provide(slowTest))
  })

  it.effect(
    "requires the password again when the server or account changes",
    () =>
      Effect.gen(function* () {
        const email = yield* OrgEmail
        yield* email.save(slug, adminId, settings)
        const { password: _password, ...patch } = settings
        for (const change of [
          { host: "attacker.example.test" },
          { port: 2525 },
          { username: "other-user" }
        ]) {
          const error = yield* Effect.flip(
            email.save(slug, adminId, { ...patch, ...change })
          )
          expect(error).toEqual(
            new OrgEmailError({ reason: "password_required" })
          )
        }
        const current = yield* email.get(slug, adminId)
        expect(current.settings?.host).toBe(settings.host)
      }).pipe(Effect.provide(layer()))
  )
})
