import * as Effect from "effect/Effect"
import * as Layer from "effect/Layer"
import * as Schema from "effect/Schema"
import { asc, eq } from "drizzle-orm"
import {
  NotFound,
  ProjectStatus,
  StatusColor,
  StatusLabel,
  StatusSlug
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

    const stub = (): never => {
      throw new Error("not implemented")
    }

    return {
      list,
      create: stub as never,
      update: stub as never,
      reorder: stub as never,
      remove: stub as never
    }
  })
)
