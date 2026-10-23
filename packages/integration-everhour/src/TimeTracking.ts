import { Db } from "@pp/db"
import {
  everhourActiveTimer,
  everhourTimeAttribution,
  projectEverhourIntegration,
  projectIntegrationLink
} from "@pp/db/schema"
import {
  DEFAULT_WORK_TYPES,
  EverhourApiKeyMissing,
  GroupId,
  NotFound,
  TicketId,
  type ActiveTimer,
  type EverhourAuthInvalid,
  type EverhourConfigMissing,
  type EverhourError,
  type EverhourProjectAccessDenied,
  type EverhourRateLimited,
  type LogTimeInput,
  type OrgEverhourConfig,
  type StartSprintTimerInput,
  type StartTimerInput,
  type TicketTimeSummary,
  type WorkTypeOption,
  OrgScope,
  ProjectScope
} from "@pp/shared"
import { and, desc, eq, inArray } from "drizzle-orm"
import * as Context from "effect/Context"
import * as DateTime from "effect/DateTime"
import * as Effect from "effect/Effect"
import * as Layer from "effect/Layer"
import * as Schema from "effect/Schema"
import * as SqlClient from "effect/sql/SqlClient"

import {
  Everhour,
  type EverhourTimeEntry,
  type EverhourTimeRecord,
  type EverhourTrackingError
} from "./Client"
import { EverhourHost } from "./Host"
import { addProjectUsers } from "./ProjectUsers"

export type EverhourTimeTrackingError =
  | NotFound
  | EverhourApiKeyMissing
  | EverhourAuthInvalid
  | EverhourRateLimited
  | EverhourConfigMissing
  | EverhourError

export type EverhourLogTimeError =
  | EverhourTimeTrackingError
  | EverhourProjectAccessDenied

export interface EverhourTimeTrackingShape {
  readonly workTypesForTicket: (
    ticketId: string
  ) => Effect.Effect<ReadonlyArray<WorkTypeOption>, NotFound, ProjectScope>
  readonly startTicketTimer: (
    ticketId: string,
    input: StartTimerInput
  ) => Effect.Effect<ActiveTimer, EverhourLogTimeError, ProjectScope>
  readonly startSprintTimer: (
    groupId: string,
    input: StartSprintTimerInput
  ) => Effect.Effect<ActiveTimer, EverhourLogTimeError, ProjectScope>
  readonly stopTimer: () => Effect.Effect<
    ActiveTimer | null,
    EverhourTimeTrackingError,
    OrgScope
  >
  readonly currentTimer: () => Effect.Effect<
    ActiveTimer | null,
    EverhourTimeTrackingError,
    OrgScope
  >
  readonly logTime: (
    input: LogTimeInput
  ) => Effect.Effect<
    TicketTimeSummary | null,
    EverhourLogTimeError,
    ProjectScope
  >
  readonly ticketTimeSummary: (
    ticketId: string
  ) => Effect.Effect<TicketTimeSummary, NotFound, ProjectScope>
  readonly applyWebhookTimeEvent: (
    projectIntegrationLinkId: string,
    record: EverhourTimeRecord
  ) => Effect.Effect<void>
}

export class EverhourTimeTracking extends Context.Service<
  EverhourTimeTracking,
  EverhourTimeTrackingShape
>()("@pp/integration-everhour/TimeTracking/EverhourTimeTracking") {}

const makeTicketId = Schema.decodeSync(TicketId)
const makeGroupId = Schema.decodeSync(GroupId)

export const timerComment = (
  ticketId: string | null,
  ticketTitle: string | null,
  note?: string
): string => {
  const trimmedNote = note?.trim()
  const head = ticketId
    ? ticketTitle
      ? `${ticketId} — ${ticketTitle}`
      : ticketId
    : null
  return [head, trimmedNote ? trimmedNote : null]
    .filter((part): part is string => part !== null)
    .join(" — ")
}

export const summariseAttribution = (
  rows: ReadonlyArray<{
    readonly everhourUserId: string
    readonly seconds: number
  }>,
  everhourUserId: string | null
): { totalSeconds: number; userSeconds: number } => {
  let totalSeconds = 0
  let userSeconds = 0
  for (const row of rows) {
    totalSeconds += row.seconds
    if (everhourUserId !== null && row.everhourUserId === everhourUserId) {
      userSeconds += row.seconds
    }
  }
  return { totalSeconds, userSeconds }
}

export const latestEntry = (
  record: EverhourTimeRecord
): EverhourTimeEntry | null =>
  record.history.reduce<EverhourTimeEntry | null>(
    (latest, entry) =>
      latest === null || Number(entry.id) > Number(latest.id) ? entry : latest,
    null
  )

export const resolveSprintForTicket = (
  sprints: ReadonlyArray<{
    readonly id: string
    readonly tickets: ReadonlyArray<string>
  }>,
  ticketId: string
): string | null =>
  sprints.find((sprint) => sprint.tickets.includes(ticketId))?.id ?? null

export const workTypeOptions = (
  config: OrgEverhourConfig
): ReadonlyArray<WorkTypeOption> =>
  [...config.workTypes]
    .sort((a, b) => a.order - b.order)
    .map((workType) => ({ key: workType.key, label: workType.label }))

type AttributionContext = Readonly<{
  projectIntegrationLinkId: string
  ticketId: string | null
  groupId: string
  workTypeKey: string
  everhourUserId: string
  userId: string
}>

type TrackingLink = Readonly<{
  everhourProjectId: string
  lastSyncActorUserId: string | null
}>

export const EverhourTimeTrackingLive = Layer.effect(
  EverhourTimeTracking,
  Effect.gen(function* () {
    const db = yield* Db
    const sql = yield* SqlClient.SqlClient
    const everhour = yield* Everhour
    const host = yield* EverhourHost

    const activeLink = (projectId: string) =>
      db
        .select({
          linkId: projectIntegrationLink.id,
          organizationId: projectIntegrationLink.organizationId,
          everhourProjectId: projectEverhourIntegration.everhourProjectId,
          lastSyncActorUserId: projectEverhourIntegration.lastSyncActorUserId
        })
        .from(projectIntegrationLink)
        .innerJoin(
          projectEverhourIntegration,
          eq(
            projectEverhourIntegration.projectIntegrationLinkId,
            projectIntegrationLink.id
          )
        )
        .where(
          and(
            eq(projectIntegrationLink.projectId, projectId),
            eq(projectIntegrationLink.provider, "everhour"),
            inArray(projectIntegrationLink.status, ["active", "broken"])
          )
        )
        .orderBy(
          projectIntegrationLink.status,
          desc(projectIntegrationLink.updatedAt)
        )
        .limit(1)
        .pipe(
          Effect.orDie,
          Effect.map((rows) => rows[0] ?? null)
        )

    const loadConfig = (organizationId: string) =>
      db.query.organizationIntegration
        .findFirst({
          columns: { config: true },
          where: {
            RAW: (table, _operators) =>
              _operators.and(
                _operators.eq(table.organizationId, organizationId),
                _operators.eq(table.provider, "everhour"),
                _operators.inArray(table.status, ["active", "broken"])
              )!
          }
        })
        .pipe(
          Effect.orDie,
          Effect.map(
            (row): OrgEverhourConfig =>
              (row?.config as OrgEverhourConfig | null) ?? {
                workTypes: DEFAULT_WORK_TYPES
              }
          )
        )

    const loadSprints = host.sprints

    const actorApiKey = (userId: string) =>
      Effect.gen(function* () {
        const row = yield* db.query.userEverhourIntegration
          .findFirst({
            columns: {
              encryptedApiKey: true,
              apiKeyNonce: true,
              apiKeyTag: true,
              everhourUserId: true
            },
            where: {
              RAW: (table, _operators) => _operators.eq(table.userId, userId)
            }
          })
          .pipe(Effect.orDie)
        if (!row) return yield* new EverhourApiKeyMissing()
        const apiKey = yield* host.open({
          ciphertext: row.encryptedApiKey,
          nonce: row.apiKeyNonce,
          tag: row.apiKeyTag
        })
        return { apiKey, everhourUserId: row.everhourUserId }
      })

    const everhourUserIdFor = (userId: string) =>
      db.query.userEverhourIntegration
        .findFirst({
          columns: { everhourUserId: true },
          where: {
            RAW: (table, _operators) => _operators.eq(table.userId, userId)
          }
        })
        .pipe(
          Effect.orDie,
          Effect.map((row) => row?.everhourUserId ?? null)
        )

    const resolveWorkTypeTask = (
      linkId: string,
      groupId: string,
      workTypeKey: string,
      config: OrgEverhourConfig
    ) =>
      Effect.gen(function* () {
        const row = yield* db.query.everhourWorkTypeTaskLink
          .findFirst({
            where: {
              RAW: (table, _operators) =>
                _operators.and(
                  _operators.eq(table.projectIntegrationLinkId, linkId),
                  _operators.eq(table.groupId, groupId),
                  _operators.eq(table.workTypeKey, workTypeKey)
                )!
            }
          })
          .pipe(Effect.orDie)
        if (!row) return yield* new NotFound()
        const label =
          config.workTypes.find((workType) => workType.key === workTypeKey)
            ?.label ?? workTypeKey
        return { everhourTaskId: row.everhourTaskId, workTypeLabel: label }
      })

    const ticketTitle = host.ticketTitle

    const writeAttribution = (
      record: EverhourTimeRecord,
      context: AttributionContext,
      now: Date
    ) =>
      Effect.gen(function* () {
        const entry = latestEntry(record)
        if (entry === null) {
          yield* Effect.logWarning(
            "Everhour time record has no history; attribution skipped"
          ).pipe(Effect.annotateLogs({ everhourTimeId: record.id }))
          return
        }
        yield* db
          .insert(everhourTimeAttribution)
          .values({
            everhourEntryId: entry.id,
            everhourTimeId: record.id,
            ...context,
            seconds: entry.seconds,
            date: record.date,
            origin: "pp",
            updatedAt: now
          })
          .onConflictDoUpdate({
            target: everhourTimeAttribution.everhourEntryId,
            set: { ...context, origin: "pp", updatedAt: now },
            setWhere: eq(everhourTimeAttribution.origin, "everhour")
          })
          .pipe(Effect.orDie)
      })

    const recordEverhourEdits = (record: EverhourTimeRecord, now: Date) =>
      Effect.gen(function* () {
        const known = yield* db.query.everhourTimeAttribution
          .findMany({
            where: {
              RAW: (table, _operators) =>
                _operators.eq(table.everhourTimeId, record.id)
            }
          })
          .pipe(Effect.orDie)
        const [template] = known
        if (!template) return
        if (record.seconds === 0) {
          yield* db
            .delete(everhourTimeAttribution)
            .where(eq(everhourTimeAttribution.everhourTimeId, record.id))
            .pipe(Effect.orDie)
          return
        }
        const knownIds = new Set(known.map((row) => row.everhourEntryId))
        const edits = record.history.filter((entry) => !knownIds.has(entry.id))
        if (edits.length === 0) return
        yield* db
          .insert(everhourTimeAttribution)
          .values(
            edits.map((entry) => ({
              everhourEntryId: entry.id,
              everhourTimeId: record.id,
              projectIntegrationLinkId: template.projectIntegrationLinkId,
              ticketId: null,
              groupId: template.groupId,
              workTypeKey: template.workTypeKey,
              everhourUserId: template.everhourUserId,
              userId: template.userId,
              seconds: entry.seconds,
              date: record.date,
              origin: "everhour" as const,
              updatedAt: now
            }))
          )
          .onConflictDoNothing()
          .pipe(Effect.orDie)
      })

    const clearActiveTimer = (everhourUserId: string) =>
      db
        .delete(everhourActiveTimer)
        .where(eq(everhourActiveTimer.everhourUserId, everhourUserId))
        .pipe(Effect.orDie)

    const activeTimerRowFor = (everhourUserId: string) =>
      db.query.everhourActiveTimer
        .findFirst({
          where: {
            RAW: (table, _operators) =>
              _operators.eq(table.everhourUserId, everhourUserId)
          }
        })
        .pipe(Effect.orDie)

    const assignToProject = (link: TrackingLink, everhourUserId: string) =>
      Effect.gen(function* () {
        if (link.lastSyncActorUserId === null) return false
        const owner = yield* actorApiKey(link.lastSyncActorUserId)
        return yield* addProjectUsers(
          { everhour, sql },
          owner.apiKey,
          link.everhourProjectId,
          [everhourUserId]
        )
      }).pipe(
        Effect.catch((error) =>
          Effect.logWarning("Everhour project assignment failed").pipe(
            Effect.annotateLogs({
              everhourProjectId: link.everhourProjectId,
              everhourUserId,
              errorTag: error._tag
            }),
            Effect.as(false)
          )
        )
      )

    const withProjectAccess = <A>(
      link: TrackingLink,
      everhourUserId: string,
      track: Effect.Effect<A, EverhourTrackingError>
    ) =>
      track.pipe(
        Effect.catchTag("EverhourProjectAccessDenied", (denied) =>
          assignToProject(link, everhourUserId).pipe(
            Effect.flatMap(
              (assigned): Effect.Effect<A, EverhourTrackingError> =>
                assigned ? track : Effect.fail(denied)
            )
          )
        )
      )

    const visibleTimer = (row: typeof everhourActiveTimer.$inferSelect) =>
      Effect.gen(function* () {
        const { organizationId, orgSlug } = yield* OrgScope
        const link = yield* db.query.projectIntegrationLink
          .findFirst({
            columns: { organizationId: true, projectId: true },
            where: {
              RAW: (table, _operators) =>
                _operators.eq(table.id, row.projectIntegrationLinkId)
            }
          })
          .pipe(Effect.orDie)
        if (!link || link.organizationId !== organizationId) return null
        const slug = yield* host.timeReadableSlug(link.projectId)
        if (slug === null) return null
        const config = yield* loadConfig(link.organizationId)
        const workTypeLabel =
          config.workTypes.find((workType) => workType.key === row.workTypeKey)
            ?.label ?? row.workTypeKey
        const title = row.ticketId
          ? yield* ticketTitle(orgSlug, slug, row.ticketId)
          : null
        const timer: ActiveTimer = {
          slug,
          ticketId: row.ticketId === null ? null : makeTicketId(row.ticketId),
          ticketTitle: title,
          groupId: makeGroupId(row.groupId),
          workTypeKey: row.workTypeKey,
          workTypeLabel,
          everhourTaskId: row.everhourTaskId,
          startedAt: row.startedAt
        }
        return timer
      })

    const finalizeRunning = (apiKey: string, everhourUserId: string) =>
      Effect.gen(function* () {
        const row = yield* activeTimerRowFor(everhourUserId)
        if (!row) return
        const record = yield* everhour.stopTimer(apiKey)
        const now = yield* DateTime.nowAsDate
        if (record) {
          yield* writeAttribution(
            record,
            {
              projectIntegrationLinkId: row.projectIntegrationLinkId,
              ticketId: row.ticketId,
              groupId: row.groupId,
              workTypeKey: row.workTypeKey,
              everhourUserId,
              userId: row.userId
            },
            now
          )
        }
        yield* clearActiveTimer(everhourUserId)
      })

    const startTimer = (
      ticketId: string | null,
      groupId: string,
      workTypeKey: string,
      note: string | undefined
    ) =>
      Effect.gen(function* () {
        const project = yield* ProjectScope
        const { orgSlug, slug, userId } = project
        const actor = yield* actorApiKey(userId)
        const link = yield* activeLink(project.projectId).pipe(
          Effect.flatMap((row) =>
            row ? Effect.succeed(row) : Effect.fail(new NotFound())
          )
        )
        const config = yield* loadConfig(link.organizationId)
        const task = yield* resolveWorkTypeTask(
          link.linkId,
          groupId,
          workTypeKey,
          config
        )
        const title = ticketId
          ? yield* ticketTitle(orgSlug, slug, ticketId)
          : null
        yield* finalizeRunning(actor.apiKey, actor.everhourUserId)
        const comment = timerComment(ticketId, title, note)
        const timer = yield* withProjectAccess(
          link,
          actor.everhourUserId,
          everhour.startTimer(actor.apiKey, {
            task: task.everhourTaskId,
            comment: comment.length > 0 ? comment : undefined
          })
        )
        const now = yield* DateTime.nowAsDate
        yield* db
          .insert(everhourActiveTimer)
          .values({
            everhourUserId: actor.everhourUserId,
            userId,
            projectIntegrationLinkId: link.linkId,
            ticketId,
            groupId,
            workTypeKey,
            everhourTaskId: task.everhourTaskId,
            everhourTimerId: timer.id,
            startedAt: now
          })
          .onConflictDoUpdate({
            target: everhourActiveTimer.everhourUserId,
            set: {
              userId,
              projectIntegrationLinkId: link.linkId,
              ticketId,
              groupId,
              workTypeKey,
              everhourTaskId: task.everhourTaskId,
              everhourTimerId: timer.id,
              startedAt: now
            }
          })
          .pipe(Effect.orDie)
        return {
          slug,
          ticketId,
          ticketTitle: title,
          groupId,
          workTypeKey,
          workTypeLabel: task.workTypeLabel,
          everhourTaskId: task.everhourTaskId,
          startedAt: now
        } as ActiveTimer
      })

    const workTypesForTicket: EverhourTimeTrackingShape["workTypesForTicket"] =
      (ticketId) =>
        Effect.gen(function* () {
          const project = yield* ProjectScope
          const { orgSlug, slug } = project
          const link = yield* activeLink(project.projectId)
          if (!link) return []
          const sprints = yield* loadSprints(orgSlug, slug)
          const groupId = resolveSprintForTicket(sprints, ticketId)
          if (groupId === null) return []
          const config = yield* loadConfig(link.organizationId)
          return workTypeOptions(config)
        })

    const startTicketTimer: EverhourTimeTrackingShape["startTicketTimer"] = (
      ticketId,
      input
    ) =>
      Effect.gen(function* () {
        const { orgSlug, slug } = yield* ProjectScope
        const sprints = yield* loadSprints(orgSlug, slug)
        const groupId = resolveSprintForTicket(sprints, ticketId)
        if (groupId === null) return yield* new NotFound()
        return yield* startTimer(
          ticketId,
          groupId,
          input.workTypeKey,
          input.comment
        )
      })

    const startSprintTimer: EverhourTimeTrackingShape["startSprintTimer"] = (
      groupId,
      input
    ) => startTimer(null, groupId, input.workTypeKey, input.comment)

    const stopTimer: EverhourTimeTrackingShape["stopTimer"] = () =>
      Effect.gen(function* () {
        const { userId } = yield* OrgScope
        const actor = yield* actorApiKey(userId)
        const row = yield* activeTimerRowFor(actor.everhourUserId)
        const record = yield* everhour.stopTimer(actor.apiKey)
        if (!row) return null
        const now = yield* DateTime.nowAsDate
        if (record) {
          yield* writeAttribution(
            record,
            {
              projectIntegrationLinkId: row.projectIntegrationLinkId,
              ticketId: row.ticketId,
              groupId: row.groupId,
              workTypeKey: row.workTypeKey,
              everhourUserId: actor.everhourUserId,
              userId: row.userId
            },
            now
          )
        }
        const timer = yield* visibleTimer(row)
        yield* clearActiveTimer(actor.everhourUserId)
        return timer
      })

    const currentTimer: EverhourTimeTrackingShape["currentTimer"] = () =>
      Effect.gen(function* () {
        const { userId } = yield* OrgScope
        const everhourUserId = yield* everhourUserIdFor(userId)
        if (everhourUserId === null) return null
        const row = yield* activeTimerRowFor(everhourUserId)
        if (!row) return null
        return yield* visibleTimer(row)
      })

    const logTime: EverhourTimeTrackingShape["logTime"] = (input) =>
      Effect.gen(function* () {
        const project = yield* ProjectScope
        const { orgSlug, slug, userId } = project
        const actor = yield* actorApiKey(userId)
        const link = yield* activeLink(project.projectId).pipe(
          Effect.flatMap((row) =>
            row ? Effect.succeed(row) : Effect.fail(new NotFound())
          )
        )
        const config = yield* loadConfig(link.organizationId)
        const ticketId = input.ticketId ?? null
        let groupId: string | null = input.groupId ?? null
        if (ticketId !== null) {
          const sprints = yield* loadSprints(orgSlug, slug)
          groupId = resolveSprintForTicket(sprints, ticketId)
        }
        if (groupId === null) return yield* new NotFound()
        const task = yield* resolveWorkTypeTask(
          link.linkId,
          groupId,
          input.workTypeKey,
          config
        )
        const title = ticketId
          ? yield* ticketTitle(orgSlug, slug, ticketId)
          : null
        const comment = timerComment(ticketId, title, input.comment)
        const record = yield* withProjectAccess(
          link,
          actor.everhourUserId,
          everhour.addTime(actor.apiKey, {
            task: task.everhourTaskId,
            time: input.seconds,
            date: input.date,
            comment: comment.length > 0 ? comment : undefined
          })
        )
        const now = yield* DateTime.nowAsDate
        yield* writeAttribution(
          record,
          {
            projectIntegrationLinkId: link.linkId,
            ticketId,
            groupId,
            workTypeKey: input.workTypeKey,
            everhourUserId: actor.everhourUserId,
            userId
          },
          now
        )
        if (ticketId === null) return null
        return yield* ticketTimeSummary(ticketId)
      })

    const ticketTimeSummary: EverhourTimeTrackingShape["ticketTimeSummary"] = (
      ticketId
    ) =>
      Effect.gen(function* () {
        const project = yield* ProjectScope
        const { userId } = project
        const link = yield* activeLink(project.projectId)
        if (!link) {
          return {
            ticketId,
            totalSeconds: 0,
            userSeconds: 0
          } as TicketTimeSummary
        }
        const rows = yield* db.query.everhourTimeAttribution
          .findMany({
            columns: { everhourUserId: true, seconds: true },
            where: {
              RAW: (table, _operators) =>
                _operators.and(
                  _operators.eq(table.projectIntegrationLinkId, link.linkId),
                  _operators.eq(table.ticketId, ticketId)
                )!
            }
          })
          .pipe(Effect.orDie)
        const everhourUserId = yield* everhourUserIdFor(userId)
        const { totalSeconds, userSeconds } = summariseAttribution(
          rows,
          everhourUserId
        )
        return { ticketId, totalSeconds, userSeconds } as TicketTimeSummary
      })

    const applyWebhookTimeEvent: EverhourTimeTrackingShape["applyWebhookTimeEvent"] =
      (_projectIntegrationLinkId, record) =>
        Effect.gen(function* () {
          const now = yield* DateTime.nowAsDate
          const recordUserId = record.userId
          const recordTaskId = record.taskId
          const matched =
            recordUserId !== null && recordTaskId !== null
              ? yield* db.query.everhourActiveTimer
                  .findFirst({
                    where: {
                      RAW: (table, _operators) =>
                        _operators.and(
                          _operators.eq(table.everhourUserId, recordUserId),
                          _operators.eq(table.everhourTaskId, recordTaskId)
                        )!
                    }
                  })
                  .pipe(Effect.orDie)
              : undefined
          if (matched) {
            yield* writeAttribution(
              record,
              {
                projectIntegrationLinkId: matched.projectIntegrationLinkId,
                ticketId: matched.ticketId,
                groupId: matched.groupId,
                workTypeKey: matched.workTypeKey,
                everhourUserId: matched.everhourUserId,
                userId: matched.userId
              },
              now
            )
            yield* clearActiveTimer(matched.everhourUserId)
            return
          }
          yield* recordEverhourEdits(record, now)
        }).pipe(Effect.ignore)

    return {
      workTypesForTicket,
      startTicketTimer,
      startSprintTimer,
      stopTimer,
      currentTimer,
      logTime,
      ticketTimeSummary,
      applyWebhookTimeEvent
    } satisfies EverhourTimeTrackingShape
  })
)
