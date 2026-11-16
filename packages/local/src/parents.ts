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
import { and, asc, eq, inArray, type SQL, sql } from "drizzle-orm"
import * as Effect from "effect/Effect"

import { compileFilter } from "./filter"
import { keyedCounts, keyedRows } from "./keyedSections"
import { LocalDb } from "./LocalDb"
import { readOrderKey } from "./orderKey"
import { groupRestriction } from "./sprints"
import { localStatuses, localTickets } from "./tables"
import { decodeStatus, finishedStatuses, toTicket } from "./ticketRows"

export type ParentGrouping = "epic" | "parent"

export type LocalParentSectionsRequest = Readonly<{
  copy: number
  by: ParentGrouping
  query: TicketListQuery
  viewerId: string | undefined
  estimation: EstimationMode
  repository: (repoId: string | null) => GitRepository | null
  pages: Readonly<Record<string, number>>
  pageSize: number
  now: Date
}>

const EPIC_SECTIONS_LIMIT = 200
const EAGER_SECTIONS = 50

const t = localTickets
const isEpic = sql`${t.type} = 'epic'`

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
    const column = by === "epic" ? t.epicSection : t.parentSection
    const countsOf = yield* keyedCounts(
      db,
      copy,
      column,
      EPIC_SECTION_NONE,
      filter
    )

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
              and(isEpic, eq(t.archived, 0)),
              EPIC_SECTIONS_LIMIT
            )),
            ...(yield* parentsOf(
              and(isEpic, eq(t.archived, 1)),
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

    const limits = Object.fromEntries(
      wanted.flatMap((section, index) =>
        countsOf.has(section.key)
          ? [
              [
                section.key,
                request.pageSize *
                  ((index < EAGER_SECTIONS ? 1 : 0) +
                    (request.pages[section.key] ?? 0))
              ]
            ]
          : []
      )
    )
    const rowsOf = yield* keyedRows(
      db,
      copy,
      column,
      EPIC_SECTION_NONE,
      filter,
      query,
      finished,
      limits
    )

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
