import type { ProjectSync } from "@pp/shared"
import * as Effect from "effect/Effect"
import * as Fiber from "effect/Fiber"
import * as Layer from "effect/Layer"
import * as ManagedRuntime from "effect/ManagedRuntime"
import * as Reactivity from "effect/reactivity/Reactivity"
import * as SqlClient from "effect/sql/SqlClient"
import * as Stream from "effect/Stream"

import { localDatabaseLayer } from "../lib/localDatabase"
import { applySync, cursorOf } from "../lib/localStore"
import { STATUSES, SUB_TICKET_PARENT, WINDOW, type Views } from "./benchData"

const SCOPE = "bench/bench"

let runs = 0

const status = "json_extract(data, '$.status')"
const rank = "json_extract(data, '$.rank')"
const archived = "json_extract(data, '$.archivedAt')"
const parent = "json_extract(data, '$.parent')"

export const INDEXES = [
  `create index if not exists bench_status on local_tickets (scope, ${status}, ${rank}, id) where ${archived} is null`,
  `create index if not exists bench_parent on local_tickets (scope, ${parent})`
]

export const SECTIONS = STATUSES.map(
  (slug) => `select * from (select '${slug}' as status, id from local_tickets
    where scope = ?1 and ${status} = '${slug}' and ${archived} is null
    order by ${rank}, id limit ${WINDOW})`
).join(" union all ")

export const COUNTS = `select ${status} as status, count(*) as n from local_tickets
  where scope = ?1 and ${archived} is null group by 1`

export const SPRINTS = `select g.id as id, count(t.id) as total,
    sum(json_extract(t.data, '$.status') = 'done') as done
  from local_groups g
  cross join json_each(g.data, '$.tickets') m
  cross join local_tickets t on t.scope = g.scope and t.id = m.value
  where g.scope = ?1 group by g.id`

export const SUB_TICKETS = `select id from local_tickets
  where scope = ?1 and ${parent} = ?2 and ${archived} is null
  order by ${rank}, id`

export const OPEN_BLOCKERS = `with visible as materialized (select id from (${SECTIONS}))
  select v.id as id, count(*) as n from visible v
  cross join local_tickets t on t.scope = ?1 and t.id = v.id
  cross join json_each(t.data, '$.relations') r
  cross join local_tickets b on b.scope = t.scope and b.id = json_extract(r.value, '$.to')
  where json_extract(r.value, '$.kind') = 'blocked_by'
    and json_extract(b.data, '$.status') != 'done'
  group by v.id`

type Latest = {
  counts?: Views["counts"]
  sections?: Views["sections"]
  sprints?: Views["sprints"]
  subTickets?: Views["subTickets"]
  openBlockers?: Views["openBlockers"]
}

export const openSqliteStore = async (indexed: boolean) => {
  const runtime = ManagedRuntime.make(
    localDatabaseLayer(`bench-${(runs += 1)}-${performance.timeOrigin}`).pipe(
      Layer.provideMerge(Reactivity.layer)
    )
  )
  const latest: Latest = {}
  const listeners = new Set<() => void>()
  const changed = () => listeners.forEach((listener) => listener())

  const query = <A>(
    statement: string,
    toView: (rows: ReadonlyArray<Record<string, unknown>>) => A,
    set: (view: A) => void
  ) =>
    Effect.gen(function* () {
      const sql = yield* SqlClient.SqlClient
      return yield* sql
        .reactive(
          ["local_tickets", "local_groups"],
          sql.unsafe<Record<string, unknown>>(statement, [
            SCOPE,
            SUB_TICKET_PARENT
          ])
        )
        .pipe(
          Stream.runForEach((rows) =>
            Effect.sync(() => {
              set(toView(rows))
              changed()
            })
          )
        )
    })

  const record = <V>(
    rows: ReadonlyArray<Record<string, unknown>>,
    value: (row: Record<string, unknown>) => V
  ) =>
    Object.fromEntries(
      rows.map((row) => [String(row.id ?? row.status), value(row)])
    )

  await runtime.runPromise(
    Effect.gen(function* () {
      const sql = yield* SqlClient.SqlClient
      if (indexed) for (const index of INDEXES) yield* sql.unsafe(index)
    })
  )

  const fibers = [
    query(
      COUNTS,
      (rows) => record(rows, (row) => Number(row.n)),
      (v) => (latest.counts = v)
    ),
    query(
      SECTIONS,
      (rows) => {
        const sections: Record<string, Array<string>> = {}
        for (const row of rows)
          (sections[String(row.status)] ??= []).push(String(row.id))
        return sections
      },
      (v) => (latest.sections = v)
    ),
    query(
      SPRINTS,
      (rows) =>
        record(rows, (row) => ({
          total: Number(row.total),
          done: Number(row.done)
        })),
      (v) => (latest.sprints = v)
    ),
    query(
      SUB_TICKETS,
      (rows) => rows.map((row) => String(row.id)),
      (v) => (latest.subTickets = v)
    ),
    query(
      OPEN_BLOCKERS,
      (rows) => record(rows, (row) => Number(row.n)),
      (v) => (latest.openBlockers = v)
    )
  ].map((effect) => runtime.runFork(effect))

  return {
    name: indexed ? "sqlite+index" : "sqlite",
    apply: (sync: ProjectSync) =>
      runtime.runPromise(
        Effect.gen(function* () {
          const base = yield* cursorOf(SCOPE)
          yield* applySync(SCOPE, base, sync)
        })
      ),
    views: (): Views | null =>
      latest.counts &&
      latest.sections &&
      latest.sprints &&
      latest.subTickets &&
      latest.openBlockers
        ? {
            counts: latest.counts,
            sections: latest.sections,
            sprints: latest.sprints,
            subTickets: latest.subTickets,
            openBlockers: latest.openBlockers
          }
        : null,
    onChange: (listener: () => void) => {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
    roundTrip: () =>
      runtime.runPromise(
        Effect.gen(function* () {
          const sql = yield* SqlClient.SqlClient
          yield* sql`select 1`
        })
      ),
    dispose: async () => {
      await Promise.all(
        fibers.map((fiber) => runtime.runPromise(Fiber.interrupt(fiber)))
      )
      await runtime.dispose()
    }
  }
}

export type BenchStore = Awaited<ReturnType<typeof openSqliteStore>>
