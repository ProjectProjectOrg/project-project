import { Db } from "@pp/db"
import {
  projectGitAutomation,
  projectIndex,
  projectStatus
} from "@pp/db/schema"
import {
  Conflict,
  GIT_AUTOMATION_EVENTS,
  GitAutomationRules,
  ProjectScope,
  type GitAutomation
} from "@pp/shared"
import { asc, eq } from "drizzle-orm"
import * as Effect from "effect/Effect"
import * as Layer from "effect/Layer"
import * as Schema from "effect/Schema"

import {
  ProjectGitAutomation,
  type ProjectGitAutomationShape
} from "./ProjectGitAutomation"

const decodeRules = Schema.decodeUnknownSync(GitAutomationRules)

export const gitAutomationFromRows = (
  rows: ReadonlyArray<
    Pick<typeof projectGitAutomation.$inferSelect, "event" | "statusSlug">
  >,
  forwardOnly: boolean
): GitAutomation => {
  const bySlug = new Map(rows.map((row) => [row.event, row.statusSlug]))
  return {
    rules: decodeRules(
      Object.fromEntries(
        GIT_AUTOMATION_EVENTS.map((event) => [event, bySlug.get(event) ?? null])
      )
    ),
    forwardOnly
  }
}

export const ProjectGitAutomationLive = Layer.effect(
  ProjectGitAutomation,
  Effect.gen(function* () {
    const db = yield* Db

    const forProject = (projectId: string) =>
      Effect.gen(function* () {
        const rows = yield* db
          .select({
            event: projectGitAutomation.event,
            statusSlug: projectGitAutomation.statusSlug
          })
          .from(projectGitAutomation)
          .where(eq(projectGitAutomation.projectId, projectId))
          .pipe(Effect.orDie)
        const project = yield* db
          .select({ forwardOnly: projectIndex.gitAutomationForwardOnly })
          .from(projectIndex)
          .where(eq(projectIndex.id, projectId))
          .pipe(Effect.orDie)
        return gitAutomationFromRows(rows, project[0]?.forwardOnly ?? true)
      })

    const configFor: ProjectGitAutomationShape["configFor"] = (projectId) =>
      Effect.gen(function* () {
        const automation = yield* forProject(projectId)
        const statuses = yield* db
          .select({ slug: projectStatus.slug })
          .from(projectStatus)
          .where(eq(projectStatus.projectId, projectId))
          .orderBy(asc(projectStatus.orderKey))
          .pipe(Effect.orDie)
        return {
          ...automation,
          statusOrder: statuses.map((status) => status.slug)
        }
      })

    const get: ProjectGitAutomationShape["get"] = () =>
      Effect.flatMap(ProjectScope, ({ projectId }) => forProject(projectId))

    const replace: ProjectGitAutomationShape["replace"] = (input) =>
      Effect.gen(function* () {
        const { projectId } = yield* ProjectScope
        const statuses = yield* db
          .select({ slug: projectStatus.slug })
          .from(projectStatus)
          .where(eq(projectStatus.projectId, projectId))
          .pipe(Effect.orDie)
        const known = new Set(statuses.map((status) => status.slug))
        const rows = GIT_AUTOMATION_EVENTS.flatMap((event) => {
          const statusSlug = input.rules[event]
          return statusSlug === null ? [] : [{ projectId, event, statusSlug }]
        })
        if (rows.some((row) => !known.has(row.statusSlug))) {
          return yield* new Conflict({ reason: "status_not_found" })
        }
        yield* db
          .transaction(() =>
            Effect.gen(function* () {
              yield* db
                .delete(projectGitAutomation)
                .where(eq(projectGitAutomation.projectId, projectId))
              if (rows.length > 0) {
                yield* db.insert(projectGitAutomation).values(rows)
              }
              yield* db
                .update(projectIndex)
                .set({ gitAutomationForwardOnly: input.forwardOnly })
                .where(eq(projectIndex.id, projectId))
            })
          )
          .pipe(Effect.orDie)
        return yield* forProject(projectId)
      })

    return ProjectGitAutomation.of({ get, configFor, replace })
  })
)
