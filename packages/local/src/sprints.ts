import {
  backlogSprintSections,
  type Estimate,
  EstimateSize,
  type EstimationMode,
  estimationUnit,
  type GitRepository,
  GroupHeader,
  GroupId,
  SPRINT_SECTION_UNSCHEDULED,
  sprintState,
  statusPhaseLookup,
  summarizeEstimates,
  type TicketListQuery,
  type TicketSprintSection,
  type TicketSprintSections,
  TicketStatus
} from "@pp/shared"
import { and, asc, count, eq, type SQL, sql } from "drizzle-orm"
import * as Effect from "effect/Effect"
import * as Schema from "effect/Schema"

import { compileFilter, type NestWithin, type Row } from "./filter"
import {
  type KeyedCounts,
  keyedCounts,
  keyedRows,
  sectionTotal
} from "./keyedSections"
import { LocalDb } from "./LocalDb"
import { readOrderKey } from "./orderKey"
import { inList, notInList, sectionPage } from "./sections"
import {
  localGroupMembers,
  localGroups,
  localStatuses,
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
const isEstimateSize = Schema.is(EstimateSize)

const t = localTickets

const ROW_BUDGET = 500

type Sprint = Readonly<{
  id: GroupId
  startsAt: Date | null
  completedAt: Date | null
  createdAt: Date
}>

const claimOrder = (a: Sprint, b: Sprint) =>
  Number(a.completedAt !== null) - Number(b.completedAt !== null) ||
  b.createdAt.getTime() - a.createdAt.getTime() ||
  a.id.length - b.id.length ||
  (a.id < b.id ? -1 : a.id > b.id ? 1 : 0)

export const sprintHeaders = (copy: number) =>
  Effect.gen(function* () {
    const db = yield* LocalDb
    return (yield* db
      .select({ data: localGroups.data })
      .from(localGroups)
      .where(eq(localGroups.copy, copy)))
      .map((row) => decodeHeader(row.data))
      .filter((header) => header.kind === "sprint")
      .map(
        (header): Sprint => ({
          id: GroupId.make(header.id),
          startsAt: header.startsAt,
          completedAt: header.completedAt,
          createdAt: header.createdAt
        })
      )
      .toSorted(claimOrder)
  })

export const groupMembership = (copy: number) =>
  Effect.gen(function* () {
    const db = yield* LocalDb
    const sprints = yield* sprintHeaders(copy)
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
    return { sprints, ticketsOf }
  })

export type Membership = Effect.Success<ReturnType<typeof groupMembership>>

export const claimTickets = (
  { sprints, ticketsOf }: Membership,
  selected: ReadonlySet<string>
) => {
  const owner = new Map<string, string>()
  for (const sprint of sprints) {
    if (!selected.has(sprint.id)) continue
    for (const id of ticketsOf.get(sprint.id) ?? [])
      if (!owner.has(id)) owner.set(id, sprint.id)
  }
  return owner
}

export const incompleteSprintTickets = (
  { sprints, ticketsOf }: Membership,
  now: Date
) =>
  sprints
    .filter((sprint) => sprintState(sprint, now) !== "completed")
    .flatMap((sprint) => ticketsOf.get(sprint.id) ?? [])

export type LocalSprintSectionsRequest = Readonly<{
  copy: number
  query: TicketListQuery
  viewerId: string | undefined
  estimation: EstimationMode
  repository: (repoId: string | null) => GitRepository | null
  pages: Readonly<Record<string, number>>
  pageSize: number
  now: Date
}>

const estimateOf = (
  row: Readonly<{ unit: string | null; size: string | null; amount: number }>
): Estimate | null =>
  row.unit === "points"
    ? { unit: "points", value: row.amount }
    : row.unit === "time"
      ? { unit: "time", minutes: row.amount }
      : row.unit === "tshirt" && isEstimateSize(row.size)
        ? { unit: "tshirt", value: row.size }
        : null

const keyOf = (sprint: Sprint | null) =>
  sprint?.id ?? SPRINT_SECTION_UNSCHEDULED

const budgeted = (
  shown: ReadonlyArray<Sprint | null>,
  counts: KeyedCounts,
  pages: Readonly<Record<string, number>>,
  pageSize: number
) => {
  const limits: Record<string, number> = {}
  let planned = 0
  for (const sprint of shown) {
    const key = keyOf(sprint)
    const available = sectionTotal(counts, key)
    const asked = pages[key] !== undefined
    if (available === 0 || (!asked && planned >= ROW_BUDGET)) continue
    const limit = pageSize * (1 + (pages[key] ?? 0))
    limits[key] = limit
    planned += Math.min(limit, available)
  }
  return limits
}

export const localSprintSections = (request: LocalSprintSectionsRequest) =>
  Effect.gen(function* () {
    const db = yield* LocalDb
    const { copy, query, now } = request
    const statuses = (yield* db
      .select({ data: localStatuses.data })
      .from(localStatuses)
      .where(eq(localStatuses.copy, copy))).map((row) => decodeStatus(row.data))
    const finished = finishedStatuses(statuses)
    const filterWithin = (nestWithin: NestWithin) =>
      and(
        ...compileFilter(
          db,
          { ...query, groupId: undefined },
          {
            copy,
            viewerId: request.viewerId,
            estimation: request.estimation,
            finished,
            nestWithin
          }
        )
      )
    const unit = estimationUnit(request.estimation)

    const amount = sql<number>`cast(${t.orderEstimate} as integer)`
    const estimateRows = (restriction: SQL | undefined) =>
      db
        .select({
          key: t.sprint,
          status: t.status,
          unit: t.estimateUnit,
          size: t.estimateSize,
          amount,
          n: count()
        })
        .from(t)
        .where(and(eq(t.copy, copy), eq(t.archived, 0), restriction))
        .groupBy(t.sprint, t.status, t.estimateUnit, t.estimateSize, amount)
    type EstimateRow = Effect.Success<ReturnType<typeof estimateRows>>[number]

    const allSprints = Effect.gen(function* () {
      const filter = filterWithin(
        (parent, row) => sql`${parent.sprint} is ${row.sprint}`
      )
      const shown = backlogSprintSections(
        yield* sprintHeaders(copy),
        undefined,
        now
      )
      const counts = yield* keyedCounts(
        db,
        copy,
        t.sprint,
        SPRINT_SECTION_UNSCHEDULED,
        filter
      )
      const rowsOf: ReadonlyMap<
        string,
        ReadonlyArray<SectionRow>
      > = yield* keyedRows(
        db,
        copy,
        t.sprint,
        SPRINT_SECTION_UNSCHEDULED,
        filter,
        query,
        finished,
        budgeted(shown, counts, request.pages, request.pageSize)
      )
      const estimated = new Map<string, Array<EstimateRow>>()
      if (unit !== null)
        for (const row of yield* estimateRows(sql`${t.sprint} is not null`)) {
          if (row.key === null) continue
          const list = estimated.get(row.key)
          if (list === undefined) estimated.set(row.key, [row])
          else list.push(row)
        }
      return { shown, counts, rowsOf, estimated }
    })

    const selectedSprints = Effect.gen(function* () {
      const membership = yield* groupMembership(copy)
      const shown = backlogSprintSections(
        membership.sprints,
        query.groupId,
        now
      )
      const owner = claimTickets(
        membership,
        new Set(shown.flatMap((sprint) => sprint?.id ?? []))
      )
      const inIncompleteSprint = incompleteSprintTickets(membership, now)
      const wantsUngrouped = query.groupId?.includes("ungrouped") ?? false
      const restrictionOf = (sprint: Sprint | null, row: Row = t) =>
        sprint === null
          ? and(
              notInList([...owner.keys()], row.id),
              wantsUngrouped ? notInList(inIncompleteSprint, row.id) : undefined
            )
          : inList(
              (membership.ticketsOf.get(sprint.id) ?? []).filter(
                (id) => owner.get(id) === sprint.id
              ),
              row.id
            )
      const filterOf = (sprint: Sprint | null) =>
        filterWithin((parent) => restrictionOf(sprint, parent))
      const counts = new Map<string, Map<string, number>>()
      for (const sprint of shown)
        counts.set(
          keyOf(sprint),
          new Map(
            (yield* db
              .select({ status: t.status, n: count() })
              .from(t)
              .where(
                and(eq(t.copy, copy), restrictionOf(sprint), filterOf(sprint))
              )
              .groupBy(t.status)).map((row) => [row.status, row.n])
          )
        )
      const limits = budgeted(shown, counts, request.pages, request.pageSize)
      const rowsOf = new Map<string, ReadonlyArray<SectionRow>>()
      const estimated = new Map<string, Array<EstimateRow>>()
      for (const sprint of shown) {
        const key = keyOf(sprint)
        const limit = limits[key]
        if (limit !== undefined)
          rowsOf.set(
            key,
            yield* sectionPage(
              db,
              copy,
              restrictionOf(sprint),
              filterOf(sprint),
              query,
              finished,
              limit
            )
          )
        if (unit !== null && sprint !== null)
          estimated.set(key, yield* estimateRows(restrictionOf(sprint)))
      }
      return { shown, counts, rowsOf, estimated }
    })

    const { shown, counts, rowsOf, estimated } =
      (query.groupId?.length ?? 0) > 0
        ? yield* selectedSprints
        : yield* allSprints

    const phaseOf = statusPhaseLookup(statuses)
    const estimatesOf = (key: string) =>
      unit === null
        ? null
        : summarizeEstimates(
            (estimated.get(key) ?? []).flatMap((row) =>
              Array.from({ length: row.n }, () => ({
                status: TicketStatus.make(row.status),
                estimate: estimateOf(row)
              }))
            ),
            unit,
            phaseOf
          )

    const byStatus: Record<TicketStatus, number> = {}
    let total = 0
    const sections: Array<TicketSprintSection> = []
    for (const sprint of shown) {
      const key = keyOf(sprint)
      let sectionCount = 0
      for (const [status, n] of counts.get(key) ?? []) {
        const slug = TicketStatus.make(status)
        byStatus[slug] = (byStatus[slug] ?? 0) + n
        sectionCount += n
      }
      total += sectionCount
      const rows = rowsOf.get(key) ?? []
      sections.push({
        key,
        count: sectionCount,
        page: {
          items: rows.map((row) => ({
            ticket: toTicket(row, request.repository),
            orderKey: readOrderKey(row.orderKey)
          })),
          nextCursor: sectionCount > rows.length ? `local:${rows.length}` : null
        },
        estimates: sprint === null ? null : estimatesOf(sprint.id)
      })
    }
    return {
      total: sections.reduce((sum, section) => sum + section.count, 0),
      counts: { total, byStatus },
      sections
    } satisfies TicketSprintSections
  })
