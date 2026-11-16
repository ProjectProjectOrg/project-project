import {
  type EstimationMode,
  type GitRepository,
  type TicketListPage,
  type TicketCountQuery,
  type TicketListQuery,
  TicketStatus
} from "@pp/shared"
import {
  and,
  exists,
  asc,
  count,
  desc,
  eq,
  inArray,
  type SQL,
  sql
} from "drizzle-orm"
import { alias, union } from "drizzle-orm/sqlite-core"
import * as Effect from "effect/Effect"
import * as Schema from "effect/Schema"

import { compileFilter, open } from "./filter"
import { LocalDb } from "./LocalDb"
import { readOrderKey } from "./orderKey"
import {
  localRelations,
  localStatuses,
  localTicketData,
  localTickets,
  orderColumns
} from "./tables"
import {
  decodeStatus,
  finishedStatuses,
  type SectionRow,
  toTicket
} from "./ticketRows"

const t = localTickets

const idList = Schema.encodeSync(
  Schema.fromJsonString(Schema.Array(Schema.String))
)

export const inList = (ids: ReadonlyArray<string>) =>
  sql`${t.id} in (select value from json_each(${idList(ids)}))`

export const notInList = (ids: ReadonlyArray<string>) =>
  sql`${t.id} not in (select value from json_each(${idList(ids)}))`

export type LocalSectionsRequest = Readonly<{
  copy: number
  query: TicketListQuery
  viewerId: string | undefined
  estimation: EstimationMode
  repository: (repoId: string | null) => GitRepository | null
  perStatus: (status: string) => number
}>

export const sectionPage = (
  db: LocalDb["Service"],
  copy: number,
  restriction: SQL | undefined,
  filter: SQL | undefined,
  query: TicketListQuery,
  finished: ReadonlyArray<string>,
  limit: number
) => {
  const column = orderColumns[query.sort.key]
  const direction = query.sort.dir === "desc" ? desc : asc
  const page = db
    .select()
    .from(t)
    .where(and(eq(t.copy, copy), restriction, filter))
    .orderBy(direction(column))
    .limit(limit)
    .as("page")
  const parent = alias(localTickets, "parent")
  const child = alias(localTickets, "child")
  const linked = alias(localTickets, "linked")
  const relation = alias(localRelations, "relation")
  const children = (value: SQL) =>
    db
      .select({ n: value })
      .from(child)
      .where(
        and(
          eq(child.copy, page.copy),
          eq(child.parent, page.id),
          eq(child.archived, 0)
        )
      )
  const isOpenLinked = (other: typeof relation.toId) =>
    exists(
      db
        .select({ one: sql`1` })
        .from(linked)
        .where(
          and(
            eq(linked.copy, relation.copy),
            eq(linked.id, other),
            open(linked, finished)
          )
        )
    )
  const directed = (
    self: typeof relation.fromId,
    other: typeof relation.toId
  ) =>
    db
      .select({ n: count() })
      .from(relation)
      .where(
        and(
          eq(relation.copy, page.copy),
          eq(self, page.id),
          eq(relation.kind, "blocked_by"),
          isOpenLinked(other)
        )
      )
  const relatedEnd = (
    self: typeof relation.fromId,
    other: typeof relation.toId
  ) =>
    db
      .select({ other: sql<string>`${other}`.as("other") })
      .from(relation)
      .where(
        and(
          eq(relation.copy, page.copy),
          eq(self, page.id),
          eq(relation.kind, "related")
        )
      )
  const ends = union(
    relatedEnd(relation.fromId, relation.toId),
    relatedEnd(relation.toId, relation.fromId)
  ).as("ends")
  const related = db
    .select({ n: count() })
    .from(ends)
    .where(
      exists(
        db
          .select({ one: sql`1` })
          .from(linked)
          .where(
            and(
              eq(linked.copy, page.copy),
              eq(linked.id, ends.other),
              eq(linked.archived, 0)
            )
          )
      )
    )
  const duplicates = db
    .select({ n: count() })
    .from(relation)
    .where(
      and(
        eq(relation.copy, page.copy),
        eq(relation.toId, page.id),
        eq(relation.kind, "duplicate_of")
      )
    )
  const pageOrder = {
    manual: page.orderManual,
    id: page.orderId,
    created: page.orderCreated,
    updated: page.orderUpdated,
    title: page.orderTitle,
    priority: page.orderPriority,
    estimate: page.orderEstimate
  }[query.sort.key]
  return db
    .select({
      id: page.id,
      data: localTicketData.data,
      orderKey: pageOrder,
      parentTitle: parent.title,
      parentType: parent.type,
      subTicketCount: sql<number>`(${children(count())})`,
      subTicketDoneCount:
        finished.length === 0
          ? sql<number>`0`
          : sql<number>`(${children(
              sql`coalesce(sum(case when ${inArray(child.status, [...finished])} then 1 else 0 end), 0)`
            )})`,
      openBlockerCount: sql<number>`(${directed(relation.fromId, relation.toId)})`,
      openBlockingCount: sql<number>`(${directed(relation.toId, relation.fromId)})`,
      relatedCount: sql<number>`(${related})`,
      duplicateCount: sql<number>`(${duplicates})`
    })
    .from(page)
    .innerJoin(
      localTicketData,
      and(eq(localTicketData.copy, page.copy), eq(localTicketData.id, page.id))
    )
    .leftJoin(
      parent,
      and(eq(parent.copy, page.copy), eq(parent.id, page.parent))
    )
    .orderBy(direction(pageOrder))
}

export type LocalCountsRequest = Readonly<{
  copy: number
  query: TicketCountQuery
  viewerId: string | undefined
  estimation: EstimationMode
}>

export const filtered = (request: LocalCountsRequest) =>
  Effect.gen(function* () {
    const db = yield* LocalDb
    const statuses = (yield* db
      .select({ data: localStatuses.data })
      .from(localStatuses)
      .where(eq(localStatuses.copy, request.copy))).map((row) =>
      decodeStatus(row.data)
    )
    const finished = finishedStatuses(statuses)
    const conditions = compileFilter(db, request.query, {
      viewerId: request.viewerId,
      estimation: request.estimation,
      finished
    })
    if (conditions === null) return null
    const filter = and(...conditions)
    const counted = yield* db
      .select({ status: t.status, n: count() })
      .from(t)
      .where(and(eq(t.copy, request.copy), filter))
      .groupBy(t.status)
    const byStatus: Record<TicketStatus, number> = {}
    for (const { status, n } of counted) byStatus[TicketStatus.make(status)] = n
    return {
      db,
      filter,
      finished,
      counted,
      counts: {
        total: counted.reduce((sum, row) => sum + row.n, 0),
        byStatus
      }
    }
  })

export const localCounts = (request: LocalCountsRequest) =>
  Effect.map(filtered(request), (result) => result?.counts ?? null)

export const localSections = (request: LocalSectionsRequest) =>
  Effect.gen(function* () {
    const result = yield* filtered(request)
    if (result === null) return null
    const { db, filter, finished, counted, counts } = result
    const sections: Record<TicketStatus, TicketListPage> = {}
    for (const { status, n } of counted) {
      const rows: ReadonlyArray<SectionRow> = yield* sectionPage(
        db,
        request.copy,
        eq(t.status, status),
        filter,
        request.query,
        finished,
        request.perStatus(status)
      )
      sections[TicketStatus.make(status)] = {
        items: rows.map((row) => ({
          ticket: toTicket(row, request.repository),
          orderKey: readOrderKey(row.orderKey)
        })),
        nextCursor: n > rows.length ? `local:${rows.length}` : null
      }
    }
    return { counts, sections }
  })
