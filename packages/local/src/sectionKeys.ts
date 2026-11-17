import * as Arr from "effect/Array"
import * as Effect from "effect/Effect"
import * as SqlClient from "effect/sql/SqlClient"

import type { Writer } from "./LocalDb"

const CHUNK = 500

const PARENT_SECTIONS = `epic_section = (select case when p.type = 'epic' then p.id else p.parent end
    from local_tickets p where p.copy = local_tickets.copy and p.id = local_tickets.parent),
  parent_section = (select p.id from local_tickets p
    where p.copy = local_tickets.copy and p.id = local_tickets.parent and p.type is not 'epic')`

const SPRINT_CLAIM = `sprint = (select m.group_id from local_group_members m
    join local_groups g on g.copy = m.copy and g.id = m.group_id
    where m.copy = local_tickets.copy and m.ticket = local_tickets.id
      and g.data ->> 'kind' = 'sprint'
    order by g.data ->> 'completedAt' is not null,
      g.data ->> 'createdAt' desc, length(g.id), g.id limit 1)`

const marks = (values: ReadonlyArray<string>) =>
  values.map(() => "?").join(", ")

const idsWhere = (
  copy: number,
  select: (list: string) => string,
  values: ReadonlyArray<string>
) =>
  Effect.gen(function* () {
    const sql = yield* SqlClient.SqlClient
    const ids: Array<string> = []
    for (const chunk of Arr.chunksOf(values, CHUNK))
      for (const row of yield* sql.unsafe<{ id: string }>(
        select(marks(chunk)),
        [copy, ...chunk]
      ))
        ids.push(row.id)
    return ids
  })

const updateByIds = (copy: number, set: string, ids: Iterable<string>) =>
  Effect.gen(function* () {
    const sql = yield* SqlClient.SqlClient
    for (const chunk of Arr.chunksOf([...ids], CHUNK))
      yield* sql.unsafe(
        `update local_tickets set ${set} where copy = ? and id in (${marks(chunk)})`,
        [copy, ...chunk]
      )
  })

const DERIVE_PART = 2000

const deriveRange = (copy: number, after: string, upto: string | null) =>
  Effect.gen(function* () {
    const sql = yield* SqlClient.SqlClient
    const range = upto === null ? "id > ?2" : "id > ?2 and id <= ?3"
    const values = upto === null ? [copy, after] : [copy, after, upto]
    yield* sql.unsafe(
      `update local_tickets set ${PARENT_SECTIONS} where copy = ?1 and ${range} and parent is not null`,
      values
    )
    yield* sql.unsafe(
      `update local_tickets set ${SPRINT_CLAIM} where copy = ?1 and ${range}
        and id in (select ticket from local_group_members where copy = ?1)`,
      values
    )
  })

export const deriveCopy = (copy: number, writer: Writer) =>
  Effect.gen(function* () {
    const sql = yield* SqlClient.SqlClient
    let after: string | null = ""
    while (after !== null) {
      let from: string = after
      after = yield* writer.write(
        sql.withTransaction(
          Effect.gen(function* () {
            for (;;) {
              const [bound] = yield* sql.unsafe<{ id: string }>(
                `select id from local_tickets where copy = ? and id > ? order by id limit 1 offset ${DERIVE_PART - 1}`,
                [copy, from]
              )
              const upto = bound?.id ?? null
              yield* deriveRange(copy, from, upto)
              if (upto === null) return null
              from = upto
              if (yield* writer.readsWaiting) return upto
            }
          })
        )
      )
    }
  })

export type Touched = Readonly<{
  tickets: ReadonlyArray<string>
  deletedTickets: ReadonlyArray<string>
  groups: ReadonlyArray<string>
}>

export const deriveTouched = (copy: number, touched: Touched) =>
  Effect.gen(function* () {
    const children = yield* idsWhere(
      copy,
      (list) =>
        `select id from local_tickets where copy = ? and parent in (${list})`,
      [...touched.tickets, ...touched.deletedTickets]
    )
    yield* updateByIds(
      copy,
      PARENT_SECTIONS,
      new Set([...touched.tickets, ...children])
    )
    const claimed = yield* idsWhere(
      copy,
      (list) =>
        `select id from local_tickets where copy = ? and archived in (0, 1) and sprint in (${list})`,
      touched.groups
    )
    const members = yield* idsWhere(
      copy,
      (list) =>
        `select ticket as id from local_group_members where copy = ? and group_id in (${list})`,
      touched.groups
    )
    yield* updateByIds(
      copy,
      SPRINT_CLAIM,
      new Set([...touched.tickets, ...claimed, ...members])
    )
  })
