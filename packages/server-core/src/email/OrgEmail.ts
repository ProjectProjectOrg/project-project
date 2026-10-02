import { randomUUID } from "node:crypto"

import { Db } from "@pp/db"
import { organizationEmail } from "@pp/db/schema"
import {
  OrgEmailError,
  type EmailSettings,
  type Forbidden,
  type NotFound,
  type OrgEmailStatus,
  type SaveOrgEmailInput
} from "@pp/shared"
import { and, eq } from "drizzle-orm"
import * as Context from "effect/Context"
import * as DateTime from "effect/DateTime"
import * as Effect from "effect/Effect"
import * as Layer from "effect/Layer"
import * as Redacted from "effect/Redacted"
import * as Result from "effect/Result"

import { CurrentOrg, requireOrgAdmin } from "../organizations/CurrentOrg"
import { SecretCrypto } from "../storage/SecretCrypto"
import { Smtp } from "./Smtp"

type AccessError = NotFound | Forbidden

type EmailRow = typeof organizationEmail.$inferSelect

const settingsOf = (row: EmailRow): EmailSettings => ({
  host: row.host,
  port: row.port,
  security: row.security,
  username: row.username,
  senderName: row.senderName,
  senderEmail: row.senderEmail,
  replyTo: row.replyTo
})

const emailStatus = (row: EmailRow | undefined): OrgEmailStatus =>
  row
    ? {
        settings: settingsOf(row),
        lastTest: row.lastTestAt
          ? { at: row.lastTestAt, error: row.lastTestError }
          : null
      }
    : { settings: null, lastTest: null }

export class OrgEmail extends Context.Service<
  OrgEmail,
  Readonly<{
    get: (
      orgSlug: string,
      userId: string
    ) => Effect.Effect<OrgEmailStatus, AccessError>
    save: (
      orgSlug: string,
      userId: string,
      input: SaveOrgEmailInput
    ) => Effect.Effect<OrgEmailStatus, AccessError | OrgEmailError>
    test: (
      orgSlug: string,
      userId: string,
      recipient: string
    ) => Effect.Effect<OrgEmailStatus, AccessError | OrgEmailError>
    disconnect: (
      orgSlug: string,
      userId: string
    ) => Effect.Effect<OrgEmailStatus, AccessError>
  }>
>()("@pp/server-core/email/OrgEmail") {
  static readonly layer = Layer.effect(
    OrgEmail,
    Effect.gen(function* () {
      const db = yield* Db
      const currentOrg = yield* CurrentOrg
      const secrets = yield* SecretCrypto
      const smtp = yield* Smtp

      const read = Effect.fnUntraced(function* (organizationId: string) {
        const rows = yield* db
          .select()
          .from(organizationEmail)
          .where(eq(organizationEmail.organizationId, organizationId))
          .pipe(Effect.orDie)
        return rows[0]
      })

      const savedCredential = Effect.fnUntraced(function* (
        organizationId: string,
        settings: EmailSettings
      ) {
        const existing = yield* read(organizationId)
        if (
          !existing ||
          existing.host !== settings.host ||
          existing.port !== settings.port ||
          existing.username !== settings.username
        )
          return yield* new OrgEmailError({ reason: "password_required" })
        return existing
      })

      return OrgEmail.of({
        get: Effect.fn("OrgEmail.get")(function* (slug, userId) {
          const org = yield* requireOrgAdmin(currentOrg, slug, userId)
          return emailStatus(yield* read(org.organizationId))
        }),
        save: Effect.fn("OrgEmail.save")(function* (slug, userId, input) {
          const org = yield* requireOrgAdmin(currentOrg, slug, userId)
          const { password, ...settings } = input
          const sealed = password
            ? yield* secrets
                .seal(password)
                .pipe(
                  Effect.mapError(
                    () => new OrgEmailError({ reason: "encryption" })
                  )
                )
            : yield* savedCredential(org.organizationId, settings)
          const values = {
            ...settings,
            revision: randomUUID(),
            ciphertext: sealed.ciphertext,
            nonce: sealed.nonce,
            tag: sealed.tag,
            lastTestAt: null,
            lastTestError: null
          }
          const [saved] = yield* db
            .insert(organizationEmail)
            .values({ organizationId: org.organizationId, ...values })
            .onConflictDoUpdate({
              target: organizationEmail.organizationId,
              set: values
            })
            .returning()
            .pipe(Effect.orDie)
          return emailStatus(saved)
        }),
        test: Effect.fn("OrgEmail.test")(function* (slug, userId, recipient) {
          const org = yield* requireOrgAdmin(currentOrg, slug, userId)
          const row = yield* read(org.organizationId)
          if (!row)
            return yield* new OrgEmailError({ reason: "not_configured" })
          const result = yield* Effect.gen(function* () {
            const password = yield* secrets
              .open(row)
              .pipe(
                Effect.mapError(
                  () => new OrgEmailError({ reason: "encryption" })
                )
              )
            yield* smtp.sendTest(
              { settings: settingsOf(row), password: Redacted.make(password) },
              recipient
            )
          }).pipe(Effect.result)
          const now = yield* DateTime.nowAsDate
          const [tested] = yield* db
            .update(organizationEmail)
            .set({
              lastTestAt: now,
              lastTestError: Result.isFailure(result)
                ? result.failure.reason
                : null
            })
            .where(
              and(
                eq(organizationEmail.organizationId, org.organizationId),
                eq(organizationEmail.revision, row.revision)
              )
            )
            .returning()
            .pipe(Effect.orDie)
          if (!tested)
            return yield* new OrgEmailError({ reason: "settings_changed" })
          return emailStatus(tested)
        }),
        disconnect: Effect.fn("OrgEmail.disconnect")(function* (slug, userId) {
          const org = yield* requireOrgAdmin(currentOrg, slug, userId)
          yield* db
            .delete(organizationEmail)
            .where(eq(organizationEmail.organizationId, org.organizationId))
            .pipe(Effect.orDie)
          return emailStatus(undefined)
        })
      })
    })
  )
}
