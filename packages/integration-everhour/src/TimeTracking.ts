import { Db } from "@pp/db"
import {
  everhourActiveTimer,
  everhourTimeAttribution,
  projectEverhourIntegration,
  projectIntegrationLink,
  userEverhourIntegration
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
  OrgEverhourConfig,
  type StartSprintTimerInput,
  type SprintTimeSummary,
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

import { EverhourApiKeys } from "./ApiKeys"
import * as Client from "./Client"
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

export class EverhourTimeTracking extends Context.Service<
  EverhourTimeTracking,
  Readonly<{
    workTypesForTicket: (
      ticketId: string
    ) => Effect.Effect<ReadonlyArray<WorkTypeOption>, NotFound, ProjectScope>
    startTicketTimer: (
      ticketId: string,
      input: StartTimerInput
    ) => Effect.Effect<ActiveTimer, EverhourLogTimeError, ProjectScope>
    startSprintTimer: (
      groupId: string,
      input: StartSprintTimerInput
    ) => Effect.Effect<ActiveTimer, EverhourLogTimeError, ProjectScope>
    stopTimer: () => Effect.Effect<
      ActiveTimer | null,
      EverhourTimeTrackingError,
      OrgScope
    >
    currentTimer: () => Effect.Effect<
      ActiveTimer | null,
      EverhourTimeTrackingError,
      OrgScope
    >
    logTime: (
      input: LogTimeInput
    ) => Effect.Effect<
      TicketTimeSummary | null,
      EverhourLogTimeError,
      ProjectScope
    >
    ticketTimeSummary: (
      ticketId: string
    ) => Effect.Effect<TicketTimeSummary, NotFound, ProjectScope>
    sprintTimeSummary: (
      groupId: string
    ) => Effect.Effect<SprintTimeSummary | null, never, ProjectScope>
    applyWebhookTimeEvent: (
      projectIntegrationLinkId: string,
      record: Client.EverhourTimeRecord
    ) => Effect.Effect<void>
  }>
>()("@pp/integration-everhour/TimeTracking/EverhourTimeTracking") {}

const decodeOrgEverhourConfig = Schema.decodeUnknownSync(OrgEverhourConfig)

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
  rows: ReadonlyArray<
    Readonly<{
      everhourUserId: string
      seconds: number
    }>
  >,
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
  record: Client.EverhourTimeRecord
): Client.EverhourTimeEntry | null =>
  record.history.reduce<Client.EverhourTimeEntry | null>(
    (latest, entry) =>
      latest === null || Number(entry.id) > Number(latest.id) ? entry : latest,
    null
  )

export const resolveSprintForTicket = (
  sprints: ReadonlyArray<
    Readonly<{
      id: string
      tickets: ReadonlyArray<string>
    }>
  >,
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

const make = Effect.gen(function* () {
  const db = yield* Db
  const sql = yield* SqlClient.SqlClient
  const everhour = yield* Client.Everhour
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
            row?.config === null || row?.config === undefined
              ? { workTypes: DEFAULT_WORK_TYPES }
              : decodeOrgEverhourConfig(row.config)
        )
      )

  const loadSprints = host.sprints

  const actorApiKey = (yield* EverhourApiKeys).forUser

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
    record: Client.EverhourTimeRecord,
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

  const recordEverhourEdits = (record: Client.EverhourTimeRecord, now: Date) =>
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
    track: Effect.Effect<A, Client.EverhourTrackingError>
  ) =>
    track.pipe(
      Effect.catchTag("EverhourProjectAccessDenied", (denied) =>
        assignToProject(link, everhourUserId).pipe(
          Effect.flatMap(
            (assigned): Effect.Effect<A, Client.EverhourTrackingError> =>
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
      const [slug, config] = yield* Effect.all(
        [
          host.timeReadableSlug(link.projectId),
          loadConfig(link.organizationId)
        ],
        { concurrency: 2 }
      )
      if (slug === null) return null
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
      const [actor, activeRow] = yield* Effect.all(
        [actorApiKey(userId), activeLink(project.projectId)],
        { concurrency: 2 }
      )
      if (!activeRow) return yield* new NotFound()
      const link = activeRow
      const [task, title] = yield* Effect.all(
        [
          loadConfig(link.organizationId).pipe(
            Effect.flatMap((config) =>
              resolveWorkTypeTask(link.linkId, groupId, workTypeKey, config)
            )
          ),
          ticketId ? ticketTitle(orgSlug, slug, ticketId) : Effect.succeed(null)
        ],
        { concurrency: 2 }
      )
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
        ticketId: ticketId === null ? null : makeTicketId(ticketId),
        ticketTitle: title,
        groupId: makeGroupId(groupId),
        workTypeKey,
        workTypeLabel: task.workTypeLabel,
        everhourTaskId: task.everhourTaskId,
        startedAt: now
      } satisfies ActiveTimer
    })

  const workTypesForTicket = Effect.fn(
    "EverhourTimeTracking.workTypesForTicket"
  )(function* (ticketId: string) {
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

  const startTicketTimer = Effect.fn("EverhourTimeTracking.startTicketTimer")(
    function* (ticketId: string, input: StartTimerInput) {
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
    }
  )

  const startSprintTimer = Effect.fn("EverhourTimeTracking.startSprintTimer")(
    function* (groupId: string, input: StartSprintTimerInput) {
      return yield* startTimer(null, groupId, input.workTypeKey, input.comment)
    }
  )

  const stopTimer = Effect.fn("EverhourTimeTracking.stopTimer")(function* () {
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

  const currentTimer = Effect.fn("EverhourTimeTracking.currentTimer")(
    function* () {
      const { userId } = yield* OrgScope
      const [found] = yield* db
        .select({ timer: everhourActiveTimer })
        .from(userEverhourIntegration)
        .innerJoin(
          everhourActiveTimer,
          eq(
            everhourActiveTimer.everhourUserId,
            userEverhourIntegration.everhourUserId
          )
        )
        .where(eq(userEverhourIntegration.userId, userId))
        .limit(1)
        .pipe(Effect.orDie)
      if (!found) return null
      return yield* visibleTimer(found.timer)
    }
  )

  const logTime = Effect.fn("EverhourTimeTracking.logTime")(function* (
    input: LogTimeInput
  ) {
    const project = yield* ProjectScope
    const { orgSlug, slug, userId } = project
    const [actor, activeRow] = yield* Effect.all(
      [actorApiKey(userId), activeLink(project.projectId)],
      { concurrency: 2 }
    )
    if (!activeRow) return yield* new NotFound()
    const link = activeRow
    const ticketId = input.ticketId ?? null
    const [config, groupId, title] = yield* Effect.all(
      [
        loadConfig(link.organizationId),
        ticketId === null
          ? Effect.succeed(input.groupId ?? null)
          : loadSprints(orgSlug, slug).pipe(
              Effect.map((sprints) => resolveSprintForTicket(sprints, ticketId))
            ),
        ticketId ? ticketTitle(orgSlug, slug, ticketId) : Effect.succeed(null)
      ],
      { concurrency: "unbounded" }
    )
    if (groupId === null) return yield* new NotFound()
    const task = yield* resolveWorkTypeTask(
      link.linkId,
      groupId,
      input.workTypeKey,
      config
    )
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

  const attributedTime = (column: "ticketId" | "groupId", id: string) =>
    Effect.gen(function* () {
      const project = yield* ProjectScope
      const [link, everhourUserId] = yield* Effect.all(
        [activeLink(project.projectId), everhourUserIdFor(project.userId)],
        { concurrency: 2 }
      )
      if (!link) return null
      const rows = yield* db.query.everhourTimeAttribution
        .findMany({
          columns: { everhourUserId: true, seconds: true },
          where: {
            RAW: (table, _operators) =>
              _operators.and(
                _operators.eq(table.projectIntegrationLinkId, link.linkId),
                _operators.eq(table[column], id)
              )!
          }
        })
        .pipe(Effect.orDie)
      return summariseAttribution(rows, everhourUserId)
    })

  const ticketTimeSummary = Effect.fn("EverhourTimeTracking.ticketTimeSummary")(
    function* (ticketId: string) {
      const time = yield* attributedTime("ticketId", ticketId)
      return {
        ticketId: makeTicketId(ticketId),
        totalSeconds: time?.totalSeconds ?? 0,
        userSeconds: time?.userSeconds ?? 0
      } satisfies TicketTimeSummary
    }
  )

  const sprintTimeSummary = Effect.fn("EverhourTimeTracking.sprintTimeSummary")(
    function* (groupId: string) {
      const time = yield* attributedTime("groupId", groupId)
      return time === null
        ? null
        : ({
            groupId: makeGroupId(groupId),
            ...time
          } satisfies SprintTimeSummary)
    }
  )

  const applyWebhookTimeEvent = Effect.fn(
    "EverhourTimeTracking.applyWebhookTimeEvent"
  )(function* (
    _projectIntegrationLinkId: string,
    record: Client.EverhourTimeRecord
  ) {
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
  }, Effect.ignore())

  return EverhourTimeTracking.of({
    workTypesForTicket,
    startTicketTimer,
    startSprintTimer,
    stopTimer,
    currentTimer,
    logTime,
    ticketTimeSummary,
    sprintTimeSummary,
    applyWebhookTimeEvent
  })
})

export const layer = Layer.effect(EverhourTimeTracking, make)
