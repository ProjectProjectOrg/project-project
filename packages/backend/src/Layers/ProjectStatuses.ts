import * as Effect from "effect/Effect"
import * as Layer from "effect/Layer"
import * as Schema from "effect/Schema"
import { asc, eq } from "drizzle-orm"
import { generateKeyBetween } from "fractional-indexing"
import {
  Conflict,
  NotFound,
  OUTER_RING,
  ProjectStatus,
  StatusColor,
  StatusLabel,
  StatusSlug,
  deriveStatusSlug,
  isReservedStatusSlug
} from "@projectproject/shared"
import { projectIndex, projectStatus } from "../db/schema"
import { Db } from "../Services/Db"
import { Projects } from "../Services/Projects"
import {
  ProjectStatuses,
  type ProjectStatusesShape
} from "../Services/ProjectStatuses"

const makeSlug = Schema.decodeUnknownSync(StatusSlug)
const makeLabel = Schema.decodeUnknownSync(StatusLabel)
const makeColor = Schema.decodeUnknownSync(StatusColor)

const rowToStatus = (r: typeof projectStatus.$inferSelect): ProjectStatus => ({
  slug: makeSlug(r.slug),
  label: makeLabel(r.label),
  icon: r.icon as ProjectStatus["icon"],
  color: makeColor(r.color),
  orderKey: r.orderKey as ProjectStatus["orderKey"],
  createdBy: r.createdBy,
  createdAt: r.createdAt
})

export const ProjectStatusesLive = Layer.effect(
  ProjectStatuses,
  Effect.gen(function* () {
    const db = yield* Db
    const projects = yield* Projects

    const projectIdFromSlug = (slug: string) =>
      db.query.projectIndex
        .findFirst({
          columns: { id: true },
          where: eq(projectIndex.slug, slug)
        })
        .pipe(
          Effect.orDie,
          Effect.flatMap((row) =>
            row ? Effect.succeed(row.id) : Effect.fail(new NotFound())
          )
        )

    const list: ProjectStatusesShape["list"] = (orgSlug, userId, slug) =>
      Effect.gen(function* () {
        yield* projects.requireMember(orgSlug, userId, slug)
        const projectId = yield* projectIdFromSlug(slug)
        const rows = yield* db.query.projectStatus
          .findMany({
            where: eq(projectStatus.projectId, projectId),
            orderBy: [asc(projectStatus.orderKey)]
          })
          .pipe(Effect.orDie)
        return rows.map(rowToStatus)
      })

    const DEFAULT_ICON = "Circle"

    const pickColor = (used: ReadonlyArray<string>): string => {
      const palette = OUTER_RING.map((c) => c.hex)
      for (const c of palette) if (!used.includes(c)) return c
      return palette[used.length % palette.length]
    }

    const create: ProjectStatusesShape["create"] = (orgSlug, userId, slug, input) =>
      Effect.gen(function* () {
        yield* projects.requireRole(orgSlug, userId, slug, ["owner", "admin"])
        const projectId = yield* projectIdFromSlug(slug)

        const derived = deriveStatusSlug(input.label)
        if (derived.length === 0)
          return yield* new Conflict({ reason: "invalid_label" })
        if (isReservedStatusSlug(derived))
          return yield* new Conflict({ reason: "reserved_slug" })

        const existing = yield* db.query.projectStatus
          .findMany({
            where: eq(projectStatus.projectId, projectId),
            orderBy: [asc(projectStatus.orderKey)]
          })
          .pipe(Effect.orDie)

        if (existing.some((s) => s.slug === derived))
          return yield* new Conflict({ reason: "slug_exists" })

        const lastKey =
          existing.length > 0 ? existing[existing.length - 1].orderKey : null
        const nextKey = generateKeyBetween(lastKey, null)

        const color = input.color ?? pickColor(existing.map((s) => s.color))
        const icon = input.icon ?? DEFAULT_ICON

        const inserted = yield* db
          .insert(projectStatus)
          .values({
            projectId,
            slug: derived,
            label: input.label,
            icon,
            color,
            orderKey: nextKey,
            createdBy: userId
          })
          .returning()
          .pipe(Effect.orDie)
        return rowToStatus(inserted[0])
      })

    const stub = (): never => {
      throw new Error("not implemented")
    }

    return {
      list,
      create,
      update: stub as never,
      reorder: stub as never,
      remove: stub as never
    }
  })
)
