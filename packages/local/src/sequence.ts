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
import { and, asc, desc, eq, inArray, type SQL } from "drizzle-orm"
import { alias } from "drizzle-orm/sqlite-core"
import * as Effect from "effect/Effect"

import { groupOf } from "./board"
import { compileFilter } from "./filter"
import { LocalDb } from "./LocalDb"
import { groupMembership, groupRestriction, inList } from "./sprints"
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
  parentFound: string | null
  parentType: string | null
  grandparent: string | null
}>

type Rank = (row: Candidate) => number | null
type NestWithin = ((row: Candidate) => string | null) | undefined

const t = localTickets
const sequenceParent = alias(localTickets, "sequence_parent")
const PARENT_SECTIONS_LIMIT = 200

const epicKey = (row: Candidate) =>
  row.parentFound === null
    ? EPIC_SECTION_NONE
    : isEpicType(row.parentType)
      ? row.parentFound
      : (row.grandparent ?? EPIC_SECTION_NONE)

const ticketParentKey = (row: Candidate) =>
  row.parentFound !== null && !isEpicType(row.parentType)
    ? row.parentFound
    : EPIC_SECTION_NONE

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

type Membership = Effect.Success<ReturnType<typeof groupMembership>>

const sprintSections = (
  { sprints, ticketsOf }: Membership,
  groupIds: TicketListQuery["groupId"],
  now: Date
) => {
  const shown = backlogSprintSections(sprints, groupIds, now)
  const selected = new Set(shown.flatMap((sprint) => sprint?.id ?? []))
  const owner = new Map<string, string>()
  for (const completed of [false, true])
    for (const sprint of sprints) {
      if ((sprint.completedAt !== null) !== completed) continue
      if (!selected.has(sprint.id)) continue
      for (const id of ticketsOf.get(sprint.id) ?? [])
        if (!owner.has(id)) owner.set(id, sprint.id)
    }
  const incomplete = new Set(
    sprints.flatMap((sprint) =>
      sprint.completedAt === null ? (ticketsOf.get(sprint.id) ?? []) : []
    )
  )
  const unscheduled = shown.includes(null)
  const explicit = groupIds?.includes("ungrouped") ?? false
  const sectionOf = (row: Candidate) =>
    owner.get(row.id) ??
    (unscheduled && (!explicit || !incomplete.has(row.id)) ? "ungrouped" : null)
  return {
    rank: keyRank(
      shown.map((sprint) => sprint?.id ?? "ungrouped"),
      sectionOf
    ),
    sectionOf
  }
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
      Effect.gen(function* () {
        const conditions = compileFilter(
          db,
          { ...query, groupId: undefined, subTickets: undefined },
          {
            viewerId: request.viewerId,
            estimation: request.estimation,
            finished
          }
        )
        if (conditions === null) return null
        const direction = sort.dir === "desc" ? desc : asc
        const rows: ReadonlyArray<Candidate> = yield* db
          .select({
            id: t.id,
            title: t.title,
            status: t.status,
            type: t.type,
            parent: t.parent,
            parentFound: sequenceParent.id,
            parentType: sequenceParent.type,
            grandparent: sequenceParent.parent
          })
          .from(t)
          .leftJoin(
            sequenceParent,
            and(
              eq(sequenceParent.copy, t.copy),
              eq(sequenceParent.id, t.parent)
            )
          )
          .where(and(eq(t.copy, copy), restriction, ...conditions))
          .orderBy(direction(orderColumns[sort.key]))
        return rows
      })

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
            { ...query, archived: undefined },
            inList(group.tickets),
            DEFAULT_TICKET_SORT
          )
          return rows === null
            ? null
            : arrange(rows, statusRank(statuses), undefined, true)
        }
        const nested = query.subTickets === "nested"
        const members = yield* groupRestriction(copy, query.groupId, now)
        if (source.grouping === "status") {
          const rows = yield* candidates(query, members, query.sort)
          return rows === null
            ? null
            : arrange(rows, statusRank(statuses), (row) => row.status, nested)
        }
        if (source.grouping === "sprint") {
          const rows = yield* candidates(query, undefined, query.sort)
          if (rows === null) return null
          const sections = sprintSections(
            yield* groupMembership(copy),
            query.groupId,
            now
          )
          return arrange(rows, sections.rank, sections.sectionOf, nested)
        }
        const rows = yield* candidates(
          parentSectionQuery(query),
          members,
          query.sort
        )
        if (rows === null) return null
        if (source.grouping === "epic") {
          const epics = [
            ...(yield* titled(
              and(eq(t.type, EPIC_TYPE), eq(t.archived, 0)),
              PARENT_SECTIONS_LIMIT
            )),
            ...(yield* titled(
              and(eq(t.type, EPIC_TYPE), eq(t.archived, 1)),
              PARENT_SECTIONS_LIMIT
            ))
          ]
          return arrange(
            rows,
            keyRank(byTitle(epics), epicKey),
            undefined,
            nested
          )
        }
        const parentIds = [
          ...new Set(
            rows.map(ticketParentKey).filter((key) => key !== EPIC_SECTION_NONE)
          )
        ]
        const parents = yield* titled(inArray(t.id, parentIds), -1)
        return arrange(
          rows,
          keyRank(byTitle(parents), ticketParentKey),
          undefined,
          nested
        )
      })

    const childSequence = Effect.gen(function* () {
      const [entry] = yield* db
        .select({ parentFound: sequenceParent.id, type: sequenceParent.type })
        .from(t)
        .innerJoin(
          sequenceParent,
          and(eq(sequenceParent.copy, t.copy), eq(sequenceParent.id, t.parent))
        )
        .where(and(eq(t.copy, copy), eq(t.id, request.id)))
      if (entry === undefined) return { sequence: null }
      const rows = yield* candidates(
        { parent: [TicketId.make(entry.parentFound)], sort: CHILD_TICKET_SORT },
        undefined,
        CHILD_TICKET_SORT
      )
      if (rows === null) return null
      return {
        sequence: {
          within: isEpicType(entry.type) ? "epic" : "parent",
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
