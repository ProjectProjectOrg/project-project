import type { Db } from "@pp/db"
import {
  attachmentIndex,
  attachmentReference,
  projectImageReference
} from "@pp/db/schema"
import { isRasterImageContentType, NotFound } from "@pp/shared"
import type { ProjectIconImage } from "@pp/shared"
import { and, eq, sql } from "drizzle-orm"
import * as DateTime from "effect/DateTime"
import * as Effect from "effect/Effect"

export const iconImageSlots = (
  iconImage: ProjectIconImage | null
): { icon: string | null; iconSource: string | null } => ({
  icon: iconImage?.type === "sticker" ? iconImage.renderedAttachmentId : null,
  iconSource: iconImage?.sourceAttachmentId ?? null
})

export const replaceProjectImageReference = Effect.fn(
  "replaceProjectImageReference"
)(function* (
  db: Db["Service"],
  input: {
    orgSlug: string
    projectSlug: string
    slot: string
    attachmentId: string | null
  }
) {
  const ownSlot = and(
    eq(projectImageReference.orgSlug, input.orgSlug),
    eq(projectImageReference.projectSlug, input.projectSlug),
    eq(projectImageReference.slot, input.slot)
  )
  const previous = yield* db
    .select()
    .from(projectImageReference)
    .where(ownSlot)
    .pipe(Effect.orDie)
  if (input.attachmentId !== null) {
    const rows = yield* db
      .select()
      .from(attachmentIndex)
      .where(
        and(
          eq(attachmentIndex.id, input.attachmentId),
          eq(attachmentIndex.orgSlug, input.orgSlug),
          eq(attachmentIndex.projectSlug, input.projectSlug)
        )
      )
      .for("update")
      .pipe(Effect.orDie)
    const attachment = rows[0]
    if (
      !attachment ||
      attachment.status === "pending" ||
      !isRasterImageContentType(attachment.contentType)
    )
      return yield* new NotFound()
    yield* db
      .insert(projectImageReference)
      .values({ ...input, attachmentId: attachment.id })
      .onConflictDoUpdate({
        target: [projectImageReference.projectSlug, projectImageReference.slot],
        set: { attachmentId: attachment.id }
      })
      .pipe(Effect.orDie)
    yield* db
      .update(attachmentIndex)
      .set({ status: "live", orphanedAt: null })
      .where(eq(attachmentIndex.id, attachment.id))
      .pipe(Effect.orDie)
  } else {
    yield* db.delete(projectImageReference).where(ownSlot).pipe(Effect.orDie)
  }
  const oldId = previous[0]?.attachmentId
  if (oldId && oldId !== input.attachmentId) {
    const now = yield* DateTime.nowAsDate
    yield* db
      .update(attachmentIndex)
      .set({ status: "orphaned", orphanedAt: now })
      .where(
        and(
          eq(attachmentIndex.id, oldId),
          sql`not exists (select 1 from ${attachmentReference} where ${attachmentReference.attachmentId} = ${attachmentIndex.id})`,
          sql`not exists (select 1 from ${projectImageReference} where ${projectImageReference.attachmentId} = ${attachmentIndex.id})`
        )
      )
      .pipe(Effect.orDie)
  }
})
