import {
  EPIC_SECTION_NONE,
  EPIC_TYPE,
  type EpicSectionKey,
  type EstimationMode,
  type GitRepository,
  TicketId,
  type TicketEpicSection,
  type TicketEpicSections,
  type TicketListQuery,
  type TicketParent,
  TicketStatus,
  TypeKey
} from "@pp/shared"
import { and, asc, count, eq, inArray, type SQL, sql } from "drizzle-orm"
import { alias } from "drizzle-orm/sqlite-core"
import * as Effect from "effect/Effect"
import * as Schema from "effect/Schema"

import { compileFilter } from "./filter"
import { LocalDb } from "./LocalDb"
import { readOrderKey } from "./orderKey"
import { sectionPage } from "./sections"
import { groupRestriction, inList } from "./sprints"
import { localStatuses, localTickets, orderColumns } from "./tables"
import {
  decodeStatus,
  finishedStatuses,
  type SectionRow,
  toTicket
} from "./ticketRows"

export type ParentGrouping = "epic" | "parent"

export type LocalParentSectionsRequest = Readonly<{
  copy: number
  by: ParentGrouping
  query: TicketListQuery
  viewerId: string | undefined
  estimation: EstimationMode
  repository: (repoId: string | null) => GitRepository | null
  limits: Readonly<Record<string, number>>
  defaultLimit: number
  now: Date
}>

const EPIC_SECTIONS_LIMIT = 200

const t = localTickets
const sectionParent = alias(localTickets, "section_parent")
const limitsJson = Schema.encodeSync(
  Schema.fromJsonString(Schema.Record(Schema.String, Schema.Finite))
)

const keyOf = (db: LocalDb["Service"], by: ParentGrouping): SQL<string> => {
  const parentRow = and(
    eq(sectionParent.copy, t.copy),
    eq(sectionParent.id, t.parent)
  )
  const owner =
    by === "epic"
      ? db
          .select({
            key: sql`case when ${sectionParent.type} = ${EPIC_TYPE} then ${sectionParent.id} else ${sectionParent.parent} end`
          })
          .from(sectionParent)
          .where(parentRow)
      : db
          .select({ key: sectionParent.id })
          .from(sectionParent)
          .where(and(parentRow, sql`${sectionParent.type} is not ${EPIC_TYPE}`))
  return sql<string>`coalesce((${owner}), ${EPIC_SECTION_NONE})`
}

type Wanted = Readonly<{
  key: EpicSectionKey
  parent: TicketParent | null
  archived: boolean
}>

export const localParentSections = (request: LocalParentSectionsRequest) =>
  Effect.gen(function* () {
    const db = yield* LocalDb
    const { copy, by, query } = request
    const statuses = (yield* db
      .select({ data: localStatuses.data })
      .from(localStatuses)
      .where(eq(localStatuses.copy, copy))).map((row) => decodeStatus(row.data))
    const finished = finishedStatuses(statuses)
    const sectionQuery: TicketListQuery = {
      ...query,
      type: query.type?.length ? query.type : undefined,
      excludeType: [...(query.excludeType ?? []), TypeKey.make(EPIC_TYPE)],
      parent: undefined,
      groupId: undefined
    }
    const conditions = compileFilter(db, sectionQuery, {
      viewerId: request.viewerId,
      estimation: request.estimation,
      finished
    })
    if (conditions === null) return null
    const filter = and(
      ...conditions,
      yield* groupRestriction(copy, query.groupId, request.now)
    )
    const key = keyOf(db, by)
    const counted = yield* db
      .select({ key, status: t.status, n: count() })
      .from(t)
      .where(and(eq(t.copy, copy), filter))
      .groupBy(key, t.status)
    const countsOf = new Map<string, Map<string, number>>()
    for (const row of counted) {
      const byStatus = countsOf.get(row.key) ?? new Map<string, number>()
      byStatus.set(row.status, row.n)
      countsOf.set(row.key, byStatus)
    }

    const parentsOf = (condition: SQL | undefined, limit?: number) =>
      Effect.map(
        db
          .select({
            id: t.id,
            title: t.title,
            type: t.type,
            archived: t.archived
          })
          .from(t)
          .where(and(eq(t.copy, copy), condition))
          .orderBy(asc(t.orderTitle))
          .limit(limit ?? -1),
        (rows) =>
          rows.map(
            (row): Wanted => ({
              key: TicketId.make(row.id),
              parent: {
                id: TicketId.make(row.id),
                title: row.title,
                type: row.type === null ? null : TypeKey.make(row.type)
              },
              archived: row.archived === 1
            })
          )
      )
    const parents =
      by === "epic"
        ? [
            ...(yield* parentsOf(
              and(eq(t.type, EPIC_TYPE), eq(t.archived, 0)),
              EPIC_SECTIONS_LIMIT
            )),
            ...(yield* parentsOf(
              and(eq(t.type, EPIC_TYPE), eq(t.archived, 1)),
              EPIC_SECTIONS_LIMIT
            ))
          ]
        : yield* parentsOf(
            inArray(
              t.id,
              [...countsOf.keys()].filter((id) => id !== EPIC_SECTION_NONE)
            )
          )
    const wanted: ReadonlyArray<Wanted> = [
      ...parents.toSorted((a, b) =>
        (a.parent?.title ?? "").localeCompare(b.parent?.title ?? "")
      ),
      { key: EPIC_SECTION_NONE, parent: null, archived: false }
    ]

    const order = orderColumns[query.sort.key]
    const ranked = db
      .select({
        id: t.id,
        sectionKey: sql<string>`${key}`.as("section_key"),
        rank: sql<number>`row_number() over (partition by ${key} order by ${order} ${sql.raw(query.sort.dir === "desc" ? "desc" : "asc")})`.as(
          "section_rank"
        )
      })
      .from(t)
      .where(and(eq(t.copy, copy), filter))
      .as("ranked")
    const shown = yield* db
      .select({ id: ranked.id, sectionKey: ranked.sectionKey })
      .from(ranked)
      .where(
        sql`${ranked.rank} <= coalesce((select value from json_each(${limitsJson(request.limits)}) where key = ${ranked.sectionKey}), ${request.defaultLimit})`
      )
    const sectionOf = new Map(shown.map((row) => [row.id, row.sectionKey]))
    const rowsOf = new Map<string, Array<SectionRow>>()
    if (shown.length > 0)
      for (const row of yield* sectionPage(
        db,
        copy,
        inList(shown.map((row) => row.id)),
        filter,
        query,
        finished,
        shown.length
      )) {
        const id = toTicket(row, request.repository).id
        const section = sectionOf.get(id) ?? EPIC_SECTION_NONE
        const list = rowsOf.get(section)
        if (list === undefined) rowsOf.set(section, [row])
        else list.push(row)
      }

    const byStatus: Record<TicketStatus, number> = {}
    let total = 0
    const sections: Array<TicketEpicSection> = []
    for (const section of wanted) {
      const counts = countsOf.get(section.key) ?? new Map<string, number>()
      let sectionTotal = 0
      for (const [status, n] of counts) {
        const slug = TicketStatus.make(status)
        byStatus[slug] = (byStatus[slug] ?? 0) + n
        sectionTotal += n
      }
      total += sectionTotal
      const keep =
        by === "epic"
          ? sectionTotal > 0 || !section.archived
          : sectionTotal > 0 || section.key === EPIC_SECTION_NONE
      if (!keep) continue
      const rows = rowsOf.get(section.key) ?? []
      sections.push({
        key: section.key,
        parent: section.parent,
        count: sectionTotal,
        page: {
          items: rows.map((row) => ({
            ticket: toTicket(row, request.repository),
            orderKey: readOrderKey(row.orderKey)
          })),
          nextCursor: sectionTotal > rows.length ? `local:${rows.length}` : null
        }
      })
    }
    return {
      total: sections.reduce((sum, section) => sum + section.count, 0),
      counts: { total, byStatus },
      sections
    } satisfies TicketEpicSections
  })
