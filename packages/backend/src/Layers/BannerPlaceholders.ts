import * as Effect from "effect/Effect"
import * as Layer from "effect/Layer"
import { and, eq, sql as sqlFragment } from "drizzle-orm"
import type { ProjectBanner } from "@projectproject/shared"
import {
  bannerNeedsPlaceholder,
  encodeBannerPlaceholder,
  normalizeBanner,
  type AttachmentBanner
} from "../bannerPlaceholder"
import { attachmentIndex, projectIndex } from "../db/schema"
import {
  BannerPlaceholders,
  type BannerPlaceholdersShape
} from "../Services/BannerPlaceholders"
import { Db } from "../Services/Db"
import { OrgStorage } from "../Services/OrgStorage"
import { S3Storage } from "../Services/S3Storage"

const PRESIGN_TTL_SECONDS = 60

export const BannerPlaceholdersLive = Layer.effect(
  BannerPlaceholders,
  Effect.gen(function* () {
    const db = yield* Db
    const orgStorage = yield* OrgStorage
    const s3 = yield* S3Storage

    const generate = (orgSlug: string, attachmentId: string) =>
      Effect.gen(function* () {
        const rows = yield* db
          .select({
            objectKey: attachmentIndex.objectKey,
            filename: attachmentIndex.filename
          })
          .from(attachmentIndex)
          .where(
            and(
              eq(attachmentIndex.id, attachmentId),
              eq(attachmentIndex.orgSlug, orgSlug),
              eq(attachmentIndex.status, "live")
            )
          )
          .limit(1)
        const row = rows[0]
        if (!row) return null

        const connection = yield* orgStorage.requireConnection(orgSlug)
        const signed = yield* s3.presignGet(
          connection,
          row.objectKey,
          row.filename,
          true,
          PRESIGN_TTL_SECONDS
        )
        const response = yield* Effect.promise(() => fetch(signed))
        if (!response.ok) return null
        const buffer = yield* Effect.promise(() => response.arrayBuffer())
        return yield* Effect.promise(() =>
          encodeBannerPlaceholder(new Uint8Array(buffer))
        )
      }).pipe(
        Effect.catchCause((cause) =>
          Effect.as(
            Effect.logWarning("banner placeholder generation failed", cause),
            null
          )
        )
      )

    const persist = (
      projectSlug: string,
      attachmentId: string,
      banner: AttachmentBanner
    ) =>
      db
        .update(projectIndex)
        .set({ banner })
        .where(
          and(
            eq(projectIndex.slug, projectSlug),
            sqlFragment`${projectIndex.banner}->>'attachmentId' = ${attachmentId}`,
            sqlFragment`${projectIndex.banner}->>'placeholder' is null`
          )
        )
        .pipe(Effect.ignore)

    const ensure: BannerPlaceholdersShape["ensure"] = (
      orgSlug,
      projectSlug,
      banner
    ) =>
      Effect.gen(function* () {
        const normalized = normalizeBanner(banner)
        if (!bannerNeedsPlaceholder(normalized)) return normalized
        const placeholder = yield* generate(orgSlug, normalized.attachmentId)
        if (placeholder === null) return normalized
        const next: ProjectBanner = { ...normalized, placeholder }
        yield* persist(projectSlug, normalized.attachmentId, {
          ...normalized,
          placeholder
        })
        return next
      })

    return { ensure } satisfies BannerPlaceholdersShape
  })
)
