import { GroupId, sprintClaims, TicketId } from "@pp/shared"
import * as Cause from "effect/Cause"
import * as Effect from "effect/Effect"
import * as Layer from "effect/Layer"
import * as Option from "effect/Option"
import * as Schema from "effect/Schema"

import * as Markdown from "../markdown/Markdown"
import * as TicketIndex from "../tickets/TicketIndex"
import * as TicketIndexMaintenance from "../tickets/TicketIndexMaintenance"

export type ProjectRef = Readonly<{ orgSlug: string; projectSlug: string }>

export type SprintMigration = ProjectRef &
  Readonly<{ sprints: number; tickets: number }>

const LegacySprint = Schema.Struct({
  kind: Schema.Literal("sprint"),
  tickets: Schema.Array(TicketId),
  createdAt: Schema.DateFromString,
  completedAt: Schema.optional(Schema.NullOr(Schema.DateFromString))
})

const decodeLegacySprint = Schema.decodeUnknownOption(LegacySprint)
const decodeGroupId = Schema.decodeUnknownSync(GroupId)

type LegacySprintFile = Readonly<{
  id: GroupId
  sprint: typeof LegacySprint.Type
  data: Record<string, unknown>
  body: string
}>

export const migrateProjectSprints = (
  orgSlug: string,
  projectSlug: string
): Effect.Effect<
  SprintMigration | null,
  Markdown.MarkdownError,
  Markdown.Markdown
> =>
  Effect.gen(function* () {
    const markdown = yield* Markdown.Markdown
    const groupIds = yield* markdown.listGroupIds(orgSlug, projectSlug)
    const files = yield* Effect.forEach(
      groupIds,
      (id) =>
        markdown.readGroupFile(orgSlug, projectSlug, id).pipe(
          Effect.map(
            (file): ReadonlyArray<LegacySprintFile> =>
              decodeLegacySprint(file.data).pipe(
                Option.match({
                  onNone: () => [],
                  onSome: (sprint) => [
                    {
                      id: decodeGroupId(id),
                      sprint,
                      data: file.data,
                      body: file.body
                    }
                  ]
                })
              )
          ),
          Effect.catchTag("NotFound", () => Effect.succeed([]))
        ),
      { concurrency: 8 }
    ).pipe(Effect.map((reads) => reads.flat()))
    if (files.length === 0) return null

    const claims = sprintClaims(
      files
        .toSorted(
          (a, b) => b.sprint.createdAt.getTime() - a.sprint.createdAt.getTime()
        )
        .map(({ id, sprint }) => ({
          id,
          completedAt: sprint.completedAt ?? null,
          tickets: sprint.tickets
        }))
    )
    const listed = [...new Set(files.flatMap(({ sprint }) => sprint.tickets))]
    const tickets = new Map<string, Markdown.TicketParts>(
      (yield* Effect.forEach(
        listed,
        (id) =>
          markdown.readTicketParts(orgSlug, projectSlug, id).pipe(
            Effect.map((parts) => [[id, parts] as const]),
            Effect.catchTag("NotFound", () => Effect.succeed([]))
          ),
        { concurrency: 8 }
      )).flat()
    )

    const claimed = [...claims].flatMap(([id, sprint]) => {
      const parts = tickets.get(id)
      return parts === undefined || "sprint" in parts.data
        ? []
        : [{ id, sprint, parts }]
    })
    yield* Effect.forEach(
      claimed,
      ({ id, sprint, parts }) =>
        markdown.writeTicketWithRegion(
          orgSlug,
          projectSlug,
          id,
          { ...parts.data, sprint },
          parts.description,
          parts.region
        ),
      { concurrency: 8, discard: true }
    )

    yield* Effect.forEach(
      files,
      ({ id, sprint, data, body }) => {
        const { tickets: _tickets, ...rest } = data
        const snapshot =
          (sprint.completedAt ?? null) === null || "snapshot" in rest
            ? {}
            : {
                snapshot: sprint.tickets.flatMap((ticketId) => {
                  const ticket = tickets.get(ticketId)?.data
                  return ticket === undefined
                    ? []
                    : [
                        {
                          id: ticketId,
                          status: ticket.status,
                          ...(ticket.estimate === undefined
                            ? {}
                            : { estimate: ticket.estimate })
                        }
                      ]
                })
              }
        return markdown.writeGroupFile(
          orgSlug,
          projectSlug,
          id,
          { ...rest, ...snapshot },
          body
        )
      },
      { concurrency: 8, discard: true }
    )
    return {
      orgSlug,
      projectSlug,
      sprints: files.length,
      tickets: claimed.length
    }
  })

const reindexProject = (project: ProjectRef) =>
  Effect.gen(function* () {
    const ticketIndex = yield* TicketIndex.TicketIndex
    const maintenance = yield* TicketIndexMaintenance.TicketIndexMaintenance
    const indexed = yield* ticketIndex.projectFor(
      project.orgSlug,
      project.projectSlug
    )
    yield* maintenance.reconcileProject(indexed, { force: true })
  }).pipe(
    Effect.catchTag("NotFound", () => Effect.void),
    Effect.catchCause((cause) =>
      Effect.logError("sprint migration: ticket index rebuild failed", cause)
    ),
    Effect.annotateLogs(project)
  )

const migrateProjectSafely = (project: ProjectRef) =>
  migrateProjectSprints(project.orgSlug, project.projectSlug).pipe(
    Effect.map((migration) => ({ project, migration, failed: false })),
    Effect.catchCause((cause) =>
      Cause.hasInterrupts(cause)
        ? Effect.interrupt
        : Effect.logError(
            "sprint migration: project failed, it is retried on the next start",
            cause
          ).pipe(
            Effect.annotateLogs(project),
            Effect.as({ project, migration: null, failed: true })
          )
    )
  )

export const migrateSprintsOnBoot = Effect.gen(function* () {
  const markdown = yield* Markdown.Markdown
  const orgSlugs = yield* markdown.listOrgSlugs()
  const projects = yield* Effect.forEach(orgSlugs, (orgSlug) =>
    Effect.map(markdown.listProjectSlugs(orgSlug), (projectSlugs) =>
      projectSlugs.map((projectSlug) => ({ orgSlug, projectSlug }))
    )
  )
  const outcomes = yield* Effect.forEach(projects.flat(), migrateProjectSafely)
  const migrated = outcomes.flatMap(({ migration }) =>
    migration === null ? [] : [migration]
  )
  yield* Effect.forEach(migrated, reindexProject, { discard: true })
  yield* Effect.logInfo("sprint migration complete", {
    migratedProjects: migrated.length,
    migratedSprints: migrated.reduce(
      (total, { sprints }) => total + sprints,
      0
    ),
    rewrittenTickets: migrated.reduce(
      (total, { tickets }) => total + tickets,
      0
    ),
    failedProjects: outcomes.filter(({ failed }) => failed).length
  })
}).pipe(
  Effect.catchCause((cause) =>
    Effect.logError("sprint migration failed", cause)
  )
)

export const SprintMigrationLive = Layer.effectDiscard(migrateSprintsOnBoot)
