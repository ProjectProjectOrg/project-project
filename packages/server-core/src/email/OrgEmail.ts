import { Db } from "@pp/db"
import { organizationEmail } from "@pp/db/schema"
import {
  OrgEmailError,
  OrgScope,
  type EmailSettings,
  type OrgEmailStatus,
  type SaveOrgEmailInput
} from "@pp/shared"
import { and, eq } from "drizzle-orm"
import * as Context from "effect/Context"
import * as Crypto from "effect/Crypto"
import * as DateTime from "effect/DateTime"
import * as Effect from "effect/Effect"
import * as Layer from "effect/Layer"
import * as Redacted from "effect/Redacted"
import * as Result from "effect/Result"

import { SecretCrypto } from "../storage/SecretCrypto"
import { Smtp } from "./Smtp"

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
    get: () => Effect.Effect<OrgEmailStatus, never, OrgScope>
    save: (
      input: SaveOrgEmailInput
    ) => Effect.Effect<OrgEmailStatus, OrgEmailError, OrgScope>
    test: (
      recipient: string
    ) => Effect.Effect<OrgEmailStatus, OrgEmailError, OrgScope>
    disconnect: () => Effect.Effect<OrgEmailStatus, never, OrgScope>
  }>
>()("@pp/server-core/email/OrgEmail") {
  static readonly layer = Layer.effect(
    OrgEmail,
    Effect.gen(function* () {
      const crypto = yield* Crypto.Crypto
      const db = yield* Db
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
        get: Effect.fn("OrgEmail.get")(function* () {
          const org = yield* OrgScope
          return emailStatus(yield* read(org.organizationId))
        }),
        save: Effect.fn("OrgEmail.save")(function* (input) {
          const org = yield* OrgScope
          const { password, ...settings } = input
          const values = {
            ...settings,
            revision: yield* crypto.randomUUIDv4().pipe(Effect.orDie),
            lastTestAt: null,
            lastTestError: null
          }
          if (!password) {
            const existing = yield* savedCredential(
              org.organizationId,
              settings
            )
            // Conditional on the revision read, so a concurrent disconnect cannot be undone by restoring the stored credential.
            const [saved] = yield* db
              .update(organizationEmail)
              .set(values)
              .where(
                and(
                  eq(organizationEmail.organizationId, org.organizationId),
                  eq(organizationEmail.revision, existing.revision)
                )
              )
              .returning()
              .pipe(Effect.orDie)
            if (!saved)
              return yield* new OrgEmailError({ reason: "settings_changed" })
            return emailStatus(saved)
          }
          const sealed = yield* secrets
            .seal(password)
            .pipe(
              Effect.mapError(() => new OrgEmailError({ reason: "encryption" }))
            )
          const credential = {
            ...values,
            ciphertext: sealed.ciphertext,
            nonce: sealed.nonce,
            tag: sealed.tag
          }
          const [saved] = yield* db
            .insert(organizationEmail)
            .values({ organizationId: org.organizationId, ...credential })
            .onConflictDoUpdate({
              target: organizationEmail.organizationId,
              set: credential
            })
            .returning()
            .pipe(Effect.orDie)
          return emailStatus(saved)
        }),
        test: Effect.fn("OrgEmail.test")(function* (recipient) {
          const org = yield* OrgScope
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
        disconnect: Effect.fn("OrgEmail.disconnect")(function* () {
          const org = yield* OrgScope
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
