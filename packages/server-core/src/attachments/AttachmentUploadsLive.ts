import * as Db from "@pp/db"
import { attachmentIndex } from "@pp/db/schema"
import {
  ATTACHMENT_MAX_BYTES,
  AttachmentId,
  AttachmentTooLarge,
  AttachmentTypeRejected,
  CurrentUser,
  Forbidden,
  NotFound,
  Slug,
  StorageConfigMissing,
  StorageError,
  TicketId,
  Unauthorized,
  Validation,
  ProjectScope
} from "@pp/shared"
import { and, eq } from "drizzle-orm"
import * as Config from "effect/Config"
import * as DateTime from "effect/DateTime"
import * as Effect from "effect/Effect"
import * as Layer from "effect/Layer"
import * as Schema from "effect/Schema"
import * as Stream from "effect/Stream"
import * as SqlClient from "effect/unstable/sql/SqlClient"

import { Access } from "../access/Access"
import * as OrgStorage from "../storage/OrgStorage"
import * as S3Storage from "../storage/S3Storage"
import * as SecretCrypto from "../storage/SecretCrypto"
import * as TicketDocs from "../tickets/TicketDocs"
import { Users } from "../users/Users"
import * as Attachments from "./Attachments"
import * as AttachmentUploads from "./AttachmentUploads"

const UploadGrant = Schema.fromJsonString(
  Schema.Struct({
    purpose: Schema.Literal("ticket-attachment-upload"),
    orgSlug: Slug,
    projectSlug: Slug,
    ticketId: TicketId,
    attachmentId: AttachmentId,
    userId: Schema.String,
    expiresAt: Schema.Finite
  })
)
const SealedGrant = Schema.fromJsonString(
  Schema.Struct({
    ciphertext: Schema.String,
    nonce: Schema.String,
    tag: Schema.String
  })
)

export const AttachmentUploadsLive = Layer.effect(
  AttachmentUploads.AttachmentUploads,
  Effect.gen(function* () {
    const attachments = yield* Attachments.Attachments
    const db = yield* Db.Db
    const access = yield* Access
    const users = yield* Users
    const sql = yield* SqlClient.SqlClient
    const docs = yield* TicketDocs.TicketDocs
    const orgStorage = yield* OrgStorage.OrgStorage
    const s3 = yield* S3Storage.S3Storage
    const secrets = yield* SecretCrypto.SecretCrypto

    const requireTicket = Effect.fn("AttachmentUploads.requireTicket")(
      function* (ticketId: string) {
        const { orgSlug, slug } = yield* ProjectScope
        yield* docs.read(orgSlug, slug, ticketId).pipe(
          Effect.catchTags({
            MarkdownError: Effect.die,
            MalformedTicketDocument: Effect.die
          })
        )
      }
    )

    const prepare: AttachmentUploads.AttachmentUploads["Service"]["prepare"] =
      Effect.fn("AttachmentUploads.prepare")(function* (ticketId, input) {
        yield* requireTicket(ticketId)
        const { orgSlug, slug: projectSlug, userId } = yield* ProjectScope
        const baseUrl = yield* Config.String("BETTER_AUTH_URL").pipe(
          Config.withDefault("http://localhost:5173"),
          Effect.mapError(() => new StorageConfigMissing())
        )
        const url = yield* Effect.try({
          try: () => new URL("/api/attachment-uploads", baseUrl),
          catch: () => new StorageConfigMissing()
        })
        if (
          url.protocol !== "https:" &&
          !(
            url.protocol === "http:" &&
            ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname)
          )
        )
          return yield* new StorageConfigMissing()
        const prepared = yield* attachments.prepare(ticketId, input)
        const attachmentId = yield* Schema.decodeEffect(AttachmentId)(
          prepared.id
        ).pipe(Effect.orDie)
        const payload = yield* Schema.encodeEffect(UploadGrant)({
          purpose: "ticket-attachment-upload",
          orgSlug,
          projectSlug,
          ticketId,
          attachmentId,
          userId,
          expiresAt: prepared.expiresAt.getTime()
        }).pipe(Effect.orDie)
        const grant = yield* secrets
          .seal(payload)
          .pipe(Effect.mapError(() => new StorageConfigMissing()))
        const encoded = yield* Schema.encodeEffect(SealedGrant)(grant).pipe(
          Effect.orDie
        )
        url.searchParams.set(
          "token",
          Buffer.from(encoded).toString("base64url")
        )
        return {
          id: prepared.id,
          url: prepared.url,
          uploadUrl: url.toString(),
          expiresAt: prepared.expiresAt
        }
      })

    const receive: AttachmentUploads.AttachmentUploads["Service"]["receive"] =
      Effect.fn("AttachmentUploads.receive")(
        function* (token, contentType, body) {
          if (token.length === 0 || token.length > 4096)
            return yield* new Unauthorized()
          const sealed = yield* Schema.decodeEffect(SealedGrant)(
            Buffer.from(token, "base64url").toString("utf8")
          ).pipe(Effect.mapError(() => new Unauthorized()))
          const plaintext = yield* secrets
            .open(sealed)
            .pipe(
              Effect.mapError((error) =>
                error.reason === "open_failed"
                  ? new Unauthorized()
                  : new StorageConfigMissing()
              )
            )
          const grant = yield* Schema.decodeEffect(UploadGrant)(plaintext).pipe(
            Effect.mapError(() => new Unauthorized())
          )
          const checkExpiry = Effect.gen(function* () {
            const now = yield* DateTime.nowAsDate
            if (grant.expiresAt <= now.getTime())
              return yield* new Unauthorized()
            return undefined
          })
          yield* checkExpiry
          const uploaderScope = Effect.gen(function* () {
            const [uploader] = yield* users.fullByIds([grant.userId])
            if (uploader === undefined) return yield* new Unauthorized()
            const scope = yield* access
              .project(grant.orgSlug, grant.projectSlug)
              .pipe(Effect.provideService(CurrentUser, uploader))
            if (!scope.permissions.can({ attachment: ["upload"] })) {
              return yield* new Forbidden()
            }
            return scope
          })
          const { projectId } = yield* uploaderScope
          yield* requireTicket(grant.ticketId).pipe(
            Effect.provideServiceEffect(ProjectScope, uploaderScope)
          )
          const query = () =>
            db
              .select()
              .from(attachmentIndex)
              .where(
                and(
                  eq(attachmentIndex.id, grant.attachmentId),
                  eq(attachmentIndex.orgSlug, grant.orgSlug),
                  eq(attachmentIndex.projectId, projectId),
                  eq(attachmentIndex.ticketId, grant.ticketId),
                  eq(attachmentIndex.uploadedBy, grant.userId)
                )
              )
          const [prepared] = yield* query().pipe(Effect.orDie)
          if (!prepared) return yield* new NotFound()
          if (
            contentType.split(";")[0].trim().toLowerCase() !==
            prepared.contentType.split(";")[0].trim().toLowerCase()
          ) {
            return yield* new AttachmentTypeRejected({ contentType })
          }
          const chunks: Array<Uint8Array> = []
          let offset = 0
          yield* body.pipe(
            Stream.runForEach((chunk) =>
              Effect.gen(function* () {
                if (offset + chunk.byteLength > ATTACHMENT_MAX_BYTES)
                  return yield* new AttachmentTooLarge({
                    maxBytes: ATTACHMENT_MAX_BYTES
                  })
                chunks.push(chunk)
                offset += chunk.byteLength
                return undefined
              })
            )
          )
          if (offset === 0)
            return yield* new AttachmentTooLarge({
              maxBytes: ATTACHMENT_MAX_BYTES
            })

          const bytes = Buffer.concat(chunks, offset)

          return yield* sql
            .withTransaction(
              Effect.gen(function* () {
                const [row] = yield* query().for("update").pipe(Effect.orDie)
                if (!row || row.status === "orphaned")
                  return yield* new NotFound()
                yield* checkExpiry
                yield* requireTicket(grant.ticketId)
                if (row.status === "pending") {
                  yield* db
                    .update(attachmentIndex)
                    .set({ byteSize: bytes.byteLength })
                    .where(eq(attachmentIndex.id, row.id))
                    .pipe(Effect.orDie)
                  const connection = yield* orgStorage.requireConnection(
                    grant.orgSlug
                  )
                  yield* s3
                    .putObject(
                      connection,
                      row.objectKey,
                      row.contentType,
                      bytes
                    )
                    .pipe(
                      Effect.mapError(
                        () => new StorageError({ reason: "upload_failed" })
                      )
                    )
                }
                const { id, url, filename, contentType } =
                  yield* attachments.commit(grant.ticketId, grant.attachmentId)
                return { id, url, filename, contentType }
              }).pipe(Effect.provideServiceEffect(ProjectScope, uploaderScope))
            )
            .pipe(Effect.catchTag("SqlError", Effect.die))
        },
        Effect.timeout("60 seconds"),
        Effect.catchTag("TimeoutError", () =>
          Effect.fail(
            new Validation({
              reason:
                "Upload timed out. Retry the upload URL, or prepare a new upload if it expired."
            })
          )
        )
      )

    return { prepare, receive }
  })
)
