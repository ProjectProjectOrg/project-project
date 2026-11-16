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
  asc,
  count,
  countDistinct,
  desc,
  eq,
  inArray,
  or,
  type SQL,
  sql
} from "drizzle-orm"
import { alias } from "drizzle-orm/sqlite-core"
import * as Effect from "effect/Effect"

import { LocalDb } from "./localDatabase"
import { compileFilter, never, open } from "./localFilter"
import { readOrderKey } from "./localSchema"
import {
  localRelations,
  localStatuses,
  localTickets,
  orderColumns
} from "./localTables"
import {
  decodeStatus,
  finishedStatuses,
  type SectionRow,
  toTicket
} from "./localTicketRows"

export const LOCAL_SECTION_TABLES = [
  "local_tickets",
  "local_ticket_assignees",
  "local_ticket_tags",
  "local_relations",
  "local_statuses"
] as const

const t = localTickets
export type LocalSectionsRequest = Readonly<{
  scope: string
  query: TicketListQuery
  viewerId: string | undefined
  estimation: EstimationMode
  repository: (repoId: string | null) => GitRepository | null
  perStatus: (status: string) => number
}>

const sectionPage = (
  db: LocalDb["Service"],
  scope: string,
  status: string,
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
    .where(and(eq(t.scope, scope), eq(t.status, status), filter))
    .orderBy(direction(column))
    .limit(limit)
    .as("page")
  const parent = alias(localTickets, "parent")
  const child = alias(localTickets, "child")
  const linked = alias(localTickets, "linked")
  const relation = alias(localRelations, "relation")
  const children = (condition: SQL | undefined) =>
    db
      .select({ n: count() })
      .from(child)
      .where(
        and(
          eq(child.scope, page.scope),
          eq(child.parent, page.id),
          eq(child.archived, 0),
          condition
        )
      )
  const directed = (
    self: typeof relation.fromId,
    other: typeof relation.toId,
    kind: string,
    condition: SQL | undefined
  ) =>
    db
      .select({ n: count() })
      .from(relation)
      .innerJoin(
        linked,
        and(eq(linked.scope, relation.scope), eq(linked.id, other))
      )
      .where(
        and(
          eq(relation.scope, page.scope),
          eq(self, page.id),
          eq(relation.kind, kind),
          condition
        )
      )
  const related = db
    .select({ n: countDistinct(linked.id) })
    .from(relation)
    .innerJoin(
      linked,
      and(
        eq(linked.scope, relation.scope),
        eq(
          linked.id,
          sql`case when ${relation.fromId} = ${page.id} then ${relation.toId} else ${relation.fromId} end`
        )
      )
    )
    .where(
      and(
        eq(relation.scope, page.scope),
        or(eq(relation.fromId, page.id), eq(relation.toId, page.id)),
        eq(relation.kind, "related"),
        eq(linked.archived, 0)
      )
    )
  const duplicates = db
    .select({ n: count() })
    .from(relation)
    .where(
      and(
        eq(relation.scope, page.scope),
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
      data: page.data,
      orderKey: pageOrder,
      parentTitle: parent.title,
      parentType: parent.type,
      subTicketCount: sql<number>`(${children(undefined)})`,
      subTicketDoneCount: sql<number>`(${children(finished.length === 0 ? never : inArray(child.status, [...finished]))})`,
      openBlockerCount: sql<number>`(${directed(relation.fromId, relation.toId, "blocked_by", open(linked, finished))})`,
      openBlockingCount: sql<number>`(${directed(relation.toId, relation.fromId, "blocked_by", open(linked, finished))})`,
      relatedCount: sql<number>`(${related})`,
      duplicateCount: sql<number>`(${duplicates})`
    })
    .from(page)
    .leftJoin(
      parent,
      and(eq(parent.scope, page.scope), eq(parent.id, page.parent))
    )
    .orderBy(direction(pageOrder))
}

export type LocalCountsRequest = Readonly<{
  scope: string
  query: TicketCountQuery
  viewerId: string | undefined
  estimation: EstimationMode
}>

const filtered = (request: LocalCountsRequest) =>
  Effect.gen(function* () {
    const db = yield* LocalDb
    const statuses = (yield* db
      .select({ data: localStatuses.data })
      .from(localStatuses)
      .where(eq(localStatuses.scope, request.scope))).map((row) =>
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
      .where(and(eq(t.scope, request.scope), filter))
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
        request.scope,
        status,
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
