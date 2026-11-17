import {
  backlogSprintSections,
  CHILD_TICKET_SORT,
  DEFAULT_TICKET_SORT,
  EPIC_SECTION_NONE,
  EPIC_TYPE,
  type EstimationMode,
  isEpicType,
  type StatusFact,
  TicketId,
  type TicketListQuery,
  type TicketListSource,
  type TicketSequence,
  type TicketSequenceEntry,
  type TicketSort
} from "@pp/shared"
import { and, asc, desc, eq, inArray, type SQL, sql } from "drizzle-orm"
import * as Effect from "effect/Effect"

import { groupOf } from "./board"
import { compileFilter } from "./filter"
import { LocalDb } from "./LocalDb"
import { inList } from "./sections"
import {
  claimTickets,
  groupMembership,
  type Membership,
  sprintHeaders
} from "./sprints"
import { localTickets, orderColumns } from "./tables"
import { statusesOf } from "./ticketList"
import { finishedStatuses } from "./ticketRows"

export type LocalSequenceRequest = Readonly<{
  copy: number
  id: string
  from: TicketListSource | undefined
  viewerId: string | undefined
  estimation: EstimationMode
  now: Date
}>

type Candidate = Readonly<{
  id: string
  title: string
  status: string
  type: string | null
  parent: string | null
  sprint: string | null
  epicSection: string | null
  parentSection: string | null
}>

type Rank = (row: Candidate) => number | null
type NestWithin = ((row: Candidate) => string | null) | undefined

const t = localTickets
const isEpic = sql`${t.type} = 'epic'`
const PARENT_SECTIONS_LIMIT = 200

const statusRank = (statuses: ReadonlyArray<StatusFact>): Rank => {
  const keys = [
    ...new Set(["", ...statuses.map((status) => status.orderKey)])
  ].toSorted((a, b) => (a < b ? -1 : a > b ? 1 : 0))
  const ordinal = new Map(
    statuses.map((status) => [status.slug, keys.indexOf(status.orderKey)])
  )
  return (row) => ordinal.get(row.status) ?? 0
}

const keyRank = (
  keys: ReadonlyArray<string>,
  sectionOf: (row: Candidate) => string | null
): Rank => {
  const ordinal = new Map<string, number>()
  keys.forEach((key, index) => {
    if (!ordinal.has(key)) ordinal.set(key, index)
  })
  return (row) => {
    const key = sectionOf(row)
    return key === null ? null : (ordinal.get(key) ?? null)
  }
}

const arrange = (
  rows: ReadonlyArray<Candidate>,
  rank: Rank,
  nestWithin: NestWithin,
  nested: boolean
): ReadonlyArray<TicketSequenceEntry> => {
  const byId = new Map(rows.map((row) => [row.id, row]))
  const nestKey = (row: Candidate) => nestWithin?.(row) ?? ""
  return rows
    .filter((row) => {
      if (!nested || row.parent === null) return true
      const parent = byId.get(row.parent)
      return (
        parent === undefined ||
        isEpicType(parent.type) ||
        (nestWithin !== undefined && nestKey(parent) !== nestKey(row))
      )
    })
    .flatMap((row) => {
      const ordinal = rank(row)
      return ordinal === null ? [] : [{ row, ordinal }]
    })
    .toSorted((a, b) => a.ordinal - b.ordinal)
    .map(({ row }) => ({ id: TicketId.make(row.id), title: row.title }))
}

const byTitle = (
  parents: ReadonlyArray<Readonly<{ id: string; title: string }>>
) => [
  ...parents
    .toSorted((a, b) => a.title.localeCompare(b.title))
    .map((parent) => parent.id),
  EPIC_SECTION_NONE
]

const sprintSections = (
  sprints: Membership["sprints"],
  groupIds: TicketListQuery["groupId"],
  now: Date,
  sectionOf: (row: Candidate) => string | null
) => ({
  rank: keyRank(
    backlogSprintSections(sprints, groupIds, now).map(
      (sprint) => sprint?.id ?? "ungrouped"
    ),
    sectionOf
  ),
  sectionOf
})

const storedSprint = (row: Candidate) => row.sprint ?? "ungrouped"

const selectedSprintSections = (
  membership: Membership,
  groupIds: TicketListQuery["groupId"],
  now: Date
) => {
  const shown = backlogSprintSections(membership.sprints, groupIds, now)
  const owner = claimTickets(
    membership,
    new Set(shown.flatMap((sprint) => sprint?.id ?? []))
  )
  const incomplete = new Set(
    membership.sprints.flatMap((sprint) =>
      sprint.completedAt === null
        ? (membership.ticketsOf.get(sprint.id) ?? [])
        : []
    )
  )
  const unscheduled = shown.includes(null)
  const explicit = groupIds?.includes("ungrouped") ?? false
  const sectionOf = (row: Candidate) =>
    owner.get(row.id) ??
    (unscheduled && (!explicit || !incomplete.has(row.id)) ? "ungrouped" : null)
  return sprintSections(membership.sprints, groupIds, now, sectionOf)
}

const parentSectionQuery = (query: TicketListQuery): TicketListQuery => ({
  ...query,
  type: query.type?.length ? query.type : undefined,
  excludeType: [...(query.excludeType ?? []), EPIC_TYPE],
  parent: undefined
})

export const localSequence = (request: LocalSequenceRequest) =>
  Effect.gen(function* () {
    const db = yield* LocalDb
    const { copy, now } = request
    const statuses = yield* statusesOf(copy)
    const finished = finishedStatuses(statuses)

    const candidates = (
      query: TicketListQuery,
      restriction: SQL | undefined,
      sort: TicketSort
    ) =>
      db
        .select({
          id: t.id,
          title: t.title,
          status: t.status,
          type: t.type,
          parent: t.parent,
          sprint: t.sprint,
          epicSection: t.epicSection,
          parentSection: t.parentSection
        })
        .from(t)
        .where(
          and(
            eq(t.copy, copy),
            restriction,
            ...compileFilter(
              db,
              { ...query, subTickets: undefined },
              {
                copy,
                viewerId: request.viewerId,
                estimation: request.estimation,
                finished
              }
            )
          )
        )
        .orderBy((sort.dir === "desc" ? desc : asc)(orderColumns[sort.key]))

    const titled = (condition: SQL | undefined, limit: number) =>
      db
        .select({ id: t.id, title: t.title })
        .from(t)
        .where(and(eq(t.copy, copy), condition))
        .orderBy(asc(t.archived), asc(t.orderTitle))
        .limit(limit)

    const viewSequence = (source: TicketListSource) =>
      Effect.gen(function* () {
        const query = source.query
        if (source.kind === "sprintBoard") {
          const group = yield* groupOf(copy, source.groupId)
          if (group === null) return null
          const rows = yield* candidates(
            { ...query, groupId: undefined, archived: undefined },
            inList(group.tickets),
            DEFAULT_TICKET_SORT
          )
          return arrange(rows, statusRank(statuses), undefined, true)
        }
        const nested = query.subTickets === "nested"
        if (source.grouping === "status") {
          const rows = yield* candidates(query, undefined, query.sort)
          return arrange(
            rows,
            statusRank(statuses),
            (row) => row.status,
            nested
          )
        }
        if (source.grouping === "sprint") {
          const rows = yield* candidates(
            { ...query, groupId: undefined },
            undefined,
            query.sort
          )
          const sections =
            (query.groupId?.length ?? 0) > 0
              ? selectedSprintSections(
                  yield* groupMembership(copy),
                  query.groupId,
                  now
                )
              : sprintSections(
                  yield* sprintHeaders(copy),
                  undefined,
                  now,
                  storedSprint
                )
          return arrange(rows, sections.rank, sections.sectionOf, nested)
        }
        const rows = yield* candidates(
          parentSectionQuery(query),
          undefined,
          query.sort
        )
        if (source.grouping === "epic") {
          const epics = [
            ...(yield* titled(
              and(isEpic, eq(t.archived, 0)),
              PARENT_SECTIONS_LIMIT
            )),
            ...(yield* titled(
              and(isEpic, eq(t.archived, 1)),
              PARENT_SECTIONS_LIMIT
            ))
          ]
          return arrange(
            rows,
            keyRank(
              byTitle(epics),
              (row) => row.epicSection ?? EPIC_SECTION_NONE
            ),
            undefined,
            nested
          )
        }
        const parentIds = [
          ...new Set(rows.flatMap((row) => row.parentSection ?? []))
        ]
        const parents = yield* titled(inArray(t.id, parentIds), -1)
        return arrange(
          rows,
          keyRank(
            byTitle(parents),
            (row) => row.parentSection ?? EPIC_SECTION_NONE
          ),
          undefined,
          nested
        )
      })

    const childSequence = Effect.gen(function* () {
      const [entry] = yield* db
        .select({
          parent: t.parent,
          epicSection: t.epicSection,
          parentSection: t.parentSection
        })
        .from(t)
        .where(and(eq(t.copy, copy), eq(t.id, request.id)))
      if (entry === undefined || entry.parent === null)
        return { sequence: null }
      const within =
        entry.parentSection === entry.parent
          ? "parent"
          : entry.epicSection === entry.parent
            ? "epic"
            : null
      if (within === null) return { sequence: null }
      const rows = yield* candidates(
        { parent: [TicketId.make(entry.parent)], sort: CHILD_TICKET_SORT },
        undefined,
        CHILD_TICKET_SORT
      )
      return {
        sequence: {
          within,
          tickets: arrange(rows, () => 0, undefined, false)
        } satisfies TicketSequence
      }
    })

    if (request.from !== undefined) {
      const tickets = yield* viewSequence(request.from)
      if (tickets === null) return null
      if (tickets.some((ticket) => ticket.id === request.id))
        return {
          sequence: { within: "view", tickets } satisfies TicketSequence
        }
    }
    return yield* childSequence
  })
