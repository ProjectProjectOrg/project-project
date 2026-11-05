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
  type GitAutomation,
  type UpdateGitAutomationInput
} from "@pp/shared"
import { and, asc, eq } from "drizzle-orm"
import * as Context from "effect/Context"
import * as Effect from "effect/Effect"
import * as Layer from "effect/Layer"
import * as Schema from "effect/Schema"

import type { GitAutomationConfig } from "./automation"

export class ProjectGitAutomation extends Context.Service<
  ProjectGitAutomation,
  Readonly<{
    get: () => Effect.Effect<GitAutomation, never, ProjectScope>
    configFor: (projectId: string) => Effect.Effect<GitAutomationConfig>
    update: (
      input: UpdateGitAutomationInput
    ) => Effect.Effect<GitAutomation, Conflict, ProjectScope>
  }>
>()("@pp/server-core/git/ProjectGitAutomation") {}

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

const make = Effect.gen(function* () {
  const db = yield* Db

  const forProject = (projectId: string) =>
    Effect.gen(function* () {
      const [rows, project] = yield* Effect.all(
        [
          db
            .select({
              event: projectGitAutomation.event,
              statusSlug: projectGitAutomation.statusSlug
            })
            .from(projectGitAutomation)
            .where(eq(projectGitAutomation.projectId, projectId)),
          db
            .select({ forwardOnly: projectIndex.gitAutomationForwardOnly })
            .from(projectIndex)
            .where(eq(projectIndex.id, projectId))
        ],
        { concurrency: 2 }
      )
      return gitAutomationFromRows(rows, project[0]?.forwardOnly ?? true)
    }).pipe(Effect.orDie)

  const configFor = Effect.fn("ProjectGitAutomation.configFor")(function* (
    projectId: string
  ) {
    const [automation, statuses] = yield* Effect.all(
      [
        forProject(projectId),
        db
          .select({ slug: projectStatus.slug })
          .from(projectStatus)
          .where(eq(projectStatus.projectId, projectId))
          .orderBy(asc(projectStatus.orderKey))
          .pipe(Effect.orDie)
      ],
      { concurrency: 2 }
    )
    return {
      ...automation,
      statusOrder: statuses.map((status) => status.slug)
    }
  })

  const get = Effect.fn("ProjectGitAutomation.get")(function* () {
    const { projectId } = yield* ProjectScope
    return yield* forProject(projectId)
  })

  const update = Effect.fn("ProjectGitAutomation.update")(function* (
    input: UpdateGitAutomationInput
  ) {
    const { projectId } = yield* ProjectScope
    const changes = GIT_AUTOMATION_EVENTS.flatMap((event) => {
      const statusSlug = input.rules?.[event]
      return statusSlug === undefined ? [] : [{ event, statusSlug }]
    })
    yield* db
      .transaction(() =>
        Effect.gen(function* () {
          const statuses = yield* db
            .select({ slug: projectStatus.slug })
            .from(projectStatus)
            .where(eq(projectStatus.projectId, projectId))
            .for("share")
          const known = new Set(statuses.map((status) => status.slug))
          if (
            changes.some(
              ({ statusSlug }) => statusSlug !== null && !known.has(statusSlug)
            )
          ) {
            return yield* new Conflict({ reason: "status_not_found" })
          }
          for (const { event, statusSlug } of changes) {
            yield* db
              .delete(projectGitAutomation)
              .where(
                and(
                  eq(projectGitAutomation.projectId, projectId),
                  eq(projectGitAutomation.event, event)
                )
              )
            if (statusSlug !== null) {
              yield* db
                .insert(projectGitAutomation)
                .values({ projectId, event, statusSlug })
            }
          }
          if (input.forwardOnly !== undefined) {
            yield* db
              .update(projectIndex)
              .set({ gitAutomationForwardOnly: input.forwardOnly })
              .where(eq(projectIndex.id, projectId))
          }
        })
      )
      .pipe(
        Effect.catchTags({
          SqlError: Effect.die,
          EffectDrizzleQueryError: Effect.die
        })
      )
    return yield* forProject(projectId)
  })

  return ProjectGitAutomation.of({ get, configFor, update })
})

export const layer = Layer.effect(ProjectGitAutomation, make)
