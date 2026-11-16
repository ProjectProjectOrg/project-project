import {
  backlogSprintSections,
  type EstimationMode,
  estimationUnit,
  type GitRepository,
  GroupHeader,
  GroupId,
  SPRINT_SECTION_UNSCHEDULED,
  type SprintSectionKey,
  sprintState,
  statusPhaseLookup,
  summarizeEstimates,
  TicketFact,
  type TicketListQuery,
  type TicketSprintSection,
  type TicketSprintSections,
  TicketStatus
} from "@pp/shared"
import { and, asc, count, eq, inArray, type SQL, sql } from "drizzle-orm"
import * as Effect from "effect/Effect"
import * as Schema from "effect/Schema"

import { compileFilter } from "./filter"
import { LocalDb } from "./LocalDb"
import { readOrderKey } from "./orderKey"
import { sectionPage } from "./sections"
import {
  localGroupMembers,
  localGroups,
  localStatuses,
  localTicketData,
  localTickets
} from "./tables"
import {
  decodeStatus,
  finishedStatuses,
  type SectionRow,
  toTicket
} from "./ticketRows"

const decodeHeader = Schema.decodeUnknownSync(
  Schema.fromJsonString(GroupHeader)
)
const decodeFact = Schema.decodeUnknownSync(Schema.fromJsonString(TicketFact))
const idList = Schema.encodeSync(
  Schema.fromJsonString(Schema.Array(Schema.String))
)

const t = localTickets

const inList = (ids: ReadonlyArray<string>) =>
  sql`${t.id} in (select value from json_each(${idList(ids)}))`

const notInList = (ids: ReadonlyArray<string>) =>
  sql`${t.id} not in (select value from json_each(${idList(ids)}))`

export type LocalSprintSectionsRequest = Readonly<{
  copy: number
  query: TicketListQuery
  viewerId: string | undefined
  estimation: EstimationMode
  repository: (repoId: string | null) => GitRepository | null
  perSection: (key: SprintSectionKey) => number
  now: Date
}>

export const localSprintSections = (request: LocalSprintSectionsRequest) =>
  Effect.gen(function* () {
    const db = yield* LocalDb
    const { copy, query, now } = request
    const statuses = (yield* db
      .select({ data: localStatuses.data })
      .from(localStatuses)
      .where(eq(localStatuses.copy, copy))).map((row) => decodeStatus(row.data))
    const finished = finishedStatuses(statuses)
    const conditions = compileFilter(
      db,
      { ...query, groupId: undefined },
      { viewerId: request.viewerId, estimation: request.estimation, finished }
    )
    if (conditions === null) return null
    const filter = and(...conditions)

    const sprints = (yield* db
      .select({ data: localGroups.data })
      .from(localGroups)
      .where(eq(localGroups.copy, copy)))
      .map((row) => decodeHeader(row.data))
      .filter((header) => header.kind === "sprint")
      .map((header) => ({
        id: GroupId.make(header.id),
        startsAt: header.startsAt,
        completedAt: header.completedAt
      }))
    const members = yield* db
      .select({
        group: localGroupMembers.groupId,
        ticket: localGroupMembers.ticket
      })
      .from(localGroupMembers)
      .where(eq(localGroupMembers.copy, copy))
      .orderBy(asc(localGroupMembers.groupId), asc(localGroupMembers.position))
    const ticketsOf = new Map<string, Array<string>>()
    for (const member of members) {
      const list = ticketsOf.get(member.group)
      if (list === undefined) ticketsOf.set(member.group, [member.ticket])
      else list.push(member.ticket)
    }

    const shown = backlogSprintSections(sprints, query.groupId, now)
    const selected = new Set(shown.flatMap((sprint) => sprint?.id ?? []))
    const claimed = new Set<string>()
    const bySprint = new Map<string, Array<string>>()
    const claim = (completed: boolean) => {
      for (const sprint of sprints) {
        if ((sprint.completedAt !== null) !== completed) continue
        if (!selected.has(sprint.id)) continue
        const ids: Array<string> = []
        for (const id of ticketsOf.get(sprint.id) ?? []) {
          if (claimed.has(id)) continue
          claimed.add(id)
          ids.push(id)
        }
        bySprint.set(sprint.id, ids)
      }
    }
    claim(false)
    claim(true)
    const inIncompleteSprint = sprints
      .filter((sprint) => sprintState(sprint, now) !== "completed")
      .flatMap((sprint) => ticketsOf.get(sprint.id) ?? [])
    const wantsUngrouped = query.groupId?.includes("ungrouped") ?? false

    const unit = estimationUnit(request.estimation)
    const phaseOf = statusPhaseLookup(statuses)
    const estimatesOf = (ids: ReadonlyArray<string>) =>
      Effect.gen(function* () {
        if (unit === null) return null
        const facts =
          ids.length === 0
            ? []
            : (yield* db
                .select({ data: localTicketData.data })
                .from(localTicketData)
                .where(
                  and(
                    eq(localTicketData.copy, copy),
                    inArray(localTicketData.id, [...ids])
                  )
                )).map((row) => decodeFact(row.data))
        return summarizeEstimates(
          facts.flatMap((fact) =>
            fact.archivedAt === null
              ? [
                  {
                    status: TicketStatus.make(fact.status),
                    estimate: fact.estimate
                  }
                ]
              : []
          ),
          unit,
          phaseOf
        )
      })

    const byStatus: Record<TicketStatus, number> = {}
    let total = 0
    const sections: Array<TicketSprintSection> = []
    for (const sprint of shown) {
      const key = sprint?.id ?? SPRINT_SECTION_UNSCHEDULED
      const sprintIds = sprint === null ? null : (bySprint.get(sprint.id) ?? [])
      const restriction: SQL | undefined =
        sprintIds !== null
          ? inList(sprintIds)
          : and(
              notInList([...claimed]),
              wantsUngrouped ? notInList(inIncompleteSprint) : undefined
            )
      const counted = yield* db
        .select({ status: t.status, n: count() })
        .from(t)
        .where(and(eq(t.copy, copy), restriction, filter))
        .groupBy(t.status)
      let sectionTotal = 0
      for (const { status, n } of counted) {
        const slug = TicketStatus.make(status)
        byStatus[slug] = (byStatus[slug] ?? 0) + n
        sectionTotal += n
      }
      total += sectionTotal
      const rows: ReadonlyArray<SectionRow> = yield* sectionPage(
        db,
        copy,
        restriction,
        filter,
        query,
        finished,
        request.perSection(key)
      )
      sections.push({
        key,
        count: sectionTotal,
        page: {
          items: rows.map((row) => ({
            ticket: toTicket(row, request.repository),
            orderKey: readOrderKey(row.orderKey)
          })),
          nextCursor: sectionTotal > rows.length ? `local:${rows.length}` : null
        },
        estimates: sprintIds === null ? null : yield* estimatesOf(sprintIds)
      })
    }
    return {
      total: sections.reduce((sum, section) => sum + section.count, 0),
      counts: { total, byStatus },
      sections
    } satisfies TicketSprintSections
  })
