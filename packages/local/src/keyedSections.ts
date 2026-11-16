import type { TicketListQuery } from "@pp/shared"
import {
  and,
  asc,
  count,
  desc,
  eq,
  inArray,
  isNull,
  type SQL,
  sql
} from "drizzle-orm"
import * as Effect from "effect/Effect"

import type { LocalDb } from "./LocalDb"
import { inList, sectionPage } from "./sections"
import { localTickets, orderColumns } from "./tables"
import type { SectionRow } from "./ticketRows"

const t = localTickets

type KeyColumn = typeof t.sprint

export type KeyedCounts = ReadonlyMap<string, ReadonlyMap<string, number>>

export const keyedCounts = (
  db: LocalDb["Service"],
  copy: number,
  column: KeyColumn,
  noneKey: string,
  filter: SQL | undefined
) =>
  Effect.map(
    db
      .select({ key: column, status: t.status, n: count() })
      .from(t)
      .where(and(eq(t.copy, copy), filter))
      .groupBy(column, t.status),
    (rows): KeyedCounts => {
      const counts = new Map<string, Map<string, number>>()
      for (const row of rows) {
        const key = row.key ?? noneKey
        const byStatus = counts.get(key) ?? new Map<string, number>()
        byStatus.set(row.status, row.n)
        counts.set(key, byStatus)
      }
      return counts
    }
  )

export const sectionTotal = (counts: KeyedCounts, key: string) => {
  let total = 0
  for (const n of counts.get(key)?.values() ?? []) total += n
  return total
}

export const keyedRows = (
  db: LocalDb["Service"],
  copy: number,
  column: KeyColumn,
  noneKey: string,
  filter: SQL | undefined,
  query: TicketListQuery,
  finished: ReadonlyArray<string>,
  limits: Readonly<Record<string, number>>
) =>
  Effect.gen(function* () {
    const order = orderColumns[query.sort.key]
    const direction = query.sort.dir === "desc" ? desc : asc
    const named = Object.keys(limits).filter(
      (key) => key !== noneKey && (limits[key] ?? 0) > 0
    )
    const deepest = Math.max(0, ...named.map((key) => limits[key] ?? 0))
    const ranked = db
      .select({
        id: t.id,
        sectionKey: sql<string>`${column}`.as("section_key"),
        rank: sql<number>`row_number() over (partition by ${column} order by ${order} ${sql.raw(query.sort.dir === "desc" ? "desc" : "asc")})`.as(
          "section_rank"
        )
      })
      .from(t)
      .where(and(eq(t.copy, copy), filter, inArray(column, named)))
      .as("ranked")
    const shown =
      named.length === 0
        ? []
        : (yield* db
            .select({
              id: ranked.id,
              sectionKey: ranked.sectionKey,
              rank: ranked.rank
            })
            .from(ranked)
            .where(sql`${ranked.rank} <= ${deepest}`)).filter(
            (row) => row.rank <= (limits[row.sectionKey] ?? 0)
          )
    const noneLimit = limits[noneKey] ?? 0
    const none =
      noneLimit === 0
        ? []
        : yield* db
            .select({ id: t.id })
            .from(t)
            .where(and(eq(t.copy, copy), filter, isNull(column)))
            .orderBy(direction(order))
            .limit(noneLimit)
    const sectionOf = new Map(shown.map((row) => [row.id, row.sectionKey]))
    for (const row of none) sectionOf.set(row.id, noneKey)
    const rowsOf = new Map<string, Array<SectionRow>>()
    if (sectionOf.size === 0) return rowsOf
    for (const row of yield* sectionPage(
      db,
      copy,
      inList([...sectionOf.keys()]),
      filter,
      query,
      finished,
      sectionOf.size
    )) {
      const section = sectionOf.get(row.id) ?? noneKey
      const list = rowsOf.get(section)
      if (list === undefined) rowsOf.set(section, [row])
      else list.push(row)
    }
    return rowsOf
  })
