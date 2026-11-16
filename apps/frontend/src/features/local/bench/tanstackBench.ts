import type { ProjectSync, TicketFact } from "@pp/shared"
import {
  and,
  BTreeIndex,
  type Collection,
  count,
  createCollection,
  createLiveQueryCollection,
  eq,
  not
} from "@tanstack/db"

import { STATUSES, SUB_TICKET_PARENT, WINDOW, type Views } from "./benchData"
import type { BenchStore } from "./sqliteBench"

let runs = 0

type Ticket = Readonly<{
  id: string
  status: string
  rank: string
  parent: string | null
  archived: boolean
}>
type Relation = Readonly<{ key: string; from: string; to: string }>
type Membership = Readonly<{ key: string; group: string; ticket: string }>

type Write<Row> = Readonly<{
  begin: () => void
  write: (
    change:
      | Readonly<{ type: "insert" | "update"; value: Row }>
      | Readonly<{ type: "delete"; key: string }>
  ) => void
  commit: () => void
  has: (key: string) => boolean
}>

const synced = <Row extends object>(id: string, key: (row: Row) => string) => {
  let writer: Write<Row> | null = null
  const collection = createCollection<Row, string>({
    id,
    getKey: key,
    startSync: true,
    autoIndex: "eager",
    defaultIndexType: BTreeIndex,
    sync: {
      rowUpdateMode: "full",
      sync: ({ collection, begin, write, commit, markReady }) => {
        writer = {
          begin,
          write,
          commit: () => void commit(),
          has: (k) => collection.has(k)
        }
        markReady()
        return () => {
          writer = null
        }
      }
    }
  })
  const replace = (
    upserts: ReadonlyArray<Row>,
    deletes: ReadonlyArray<string>
  ) => {
    if (writer === null) throw new Error(`${id} is not syncing`)
    const w = writer
    w.begin()
    for (const k of deletes) if (w.has(k)) w.write({ type: "delete", key: k })
    for (const row of upserts)
      w.write({ type: w.has(key(row)) ? "update" : "insert", value: row })
    w.commit()
  }
  return { collection, replace }
}

const ticketRow = (fact: TicketFact): Ticket => ({
  id: fact.id,
  status: fact.status,
  rank: fact.rank,
  parent: fact.parent,
  archived: fact.archivedAt !== null
})

export const openTanstackStore = async (): Promise<BenchStore> => {
  const run = `${(runs += 1)}`
  const tickets = synced<Ticket>(`tickets-${run}`, (row) => row.id)
  const relations = synced<Relation>(`relations-${run}`, (row) => row.key)
  const memberships = synced<Membership>(`memberships-${run}`, (row) => row.key)
  const relationKeys = new Map<string, ReadonlyArray<string>>()
  const listeners = new Set<() => void>()

  const live = <Row extends object>(
    query: Parameters<typeof createLiveQueryCollection>[0]["query"]
  ) =>
    createLiveQueryCollection({
      startSync: true,
      query
    }) as unknown as Collection<Row>

  const counts = live<{ status: string; n: number }>((q) =>
    q
      .from({ t: tickets.collection })
      .where(({ t }) => eq(t.archived, false))
      .groupBy(({ t }) => t.status)
      .select(({ t }) => ({ status: t.status, n: count(t.id) }))
  )
  const sections = STATUSES.map((status) => ({
    status,
    rows: live<{ id: string; rank: string }>((q) =>
      q
        .from({ t: tickets.collection })
        .where(({ t }) => and(eq(t.status, status), eq(t.archived, false)))
        .orderBy(({ t }) => t.rank)
        .orderBy(({ t }) => t.id)
        .limit(WINDOW)
        .select(({ t }) => ({ id: t.id, rank: t.rank }))
    )
  }))
  const sprintTotals = live<{ group: string; n: number }>((q) =>
    q
      .from({ m: memberships.collection })
      .join(
        { t: tickets.collection },
        ({ m, t }) => eq(m.ticket, t.id),
        "inner"
      )
      .groupBy(({ m }) => m.group)
      .select(({ m, t }) => ({ group: m.group, n: count(t.id) }))
  )
  const sprintDone = live<{ group: string; n: number }>((q) =>
    q
      .from({ m: memberships.collection })
      .join(
        { t: tickets.collection },
        ({ m, t }) => eq(m.ticket, t.id),
        "inner"
      )
      .where(({ t }) => eq(t.status, "done"))
      .groupBy(({ m }) => m.group)
      .select(({ m, t }) => ({ group: m.group, n: count(t.id) }))
  )
  const subTickets = live<{ id: string; rank: string }>((q) =>
    q
      .from({ t: tickets.collection })
      .where(({ t }) =>
        and(eq(t.parent, SUB_TICKET_PARENT), eq(t.archived, false))
      )
      .orderBy(({ t }) => t.rank)
      .orderBy(({ t }) => t.id)
      .select(({ t }) => ({ id: t.id, rank: t.rank }))
  )
  const openBlockers = live<{ from: string; n: number }>((q) =>
    q
      .from({ r: relations.collection })
      .join({ b: tickets.collection }, ({ r, b }) => eq(r.to, b.id), "inner")
      .where(({ b }) => not(eq(b.status, "done")))
      .groupBy(({ r }) => r.from)
      .select(({ r, b }) => ({ from: r.from, n: count(b.id) }))
  )

  const all: ReadonlyArray<Collection<object>> = [
    counts,
    ...sections.map((s) => s.rows),
    sprintTotals,
    sprintDone,
    subTickets,
    openBlockers
  ] as ReadonlyArray<Collection<object>>
  const subscriptions = all.map((c) =>
    c.subscribeChanges(() => listeners.forEach((listener) => listener()))
  )
  await Promise.all(all.map((c) => c.toArrayWhenReady()))

  const ordered = <Row extends { id: string; rank: string }>(
    rows: ReadonlyArray<Row>
  ) =>
    rows
      .toSorted((a, b) =>
        a.rank < b.rank
          ? -1
          : a.rank > b.rank
            ? 1
            : a.id < b.id
              ? -1
              : a.id > b.id
                ? 1
                : 0
      )
      .map((row) => row.id)

  const views = (): Views => {
    const sectionIds: Record<string, ReadonlyArray<string>> = {}
    for (const { status, rows } of sections) {
      const ids = ordered(
        rows.toArray as ReadonlyArray<{ id: string; rank: string }>
      )
      if (ids.length > 0) sectionIds[status] = ids
    }
    const done = new Map(sprintDone.toArray.map((row) => [row.group, row.n]))
    const blockers = new Map(
      openBlockers.toArray.map((row) => [row.from, row.n])
    )
    const visible = Object.values(sectionIds).flat()
    return {
      counts: Object.fromEntries(
        counts.toArray.map((row) => [row.status, row.n])
      ),
      sections: sectionIds,
      sprints: Object.fromEntries(
        sprintTotals.toArray.map((row) => [
          row.group,
          { total: row.n, done: done.get(row.group) ?? 0 }
        ])
      ),
      subTickets: ordered(subTickets.toArray),
      openBlockers: Object.fromEntries(
        visible.flatMap((id) => {
          const n = blockers.get(id)
          return n === undefined ? [] : [[id, n]]
        })
      )
    }
  }

  const relationRows = (fact: TicketFact): ReadonlyArray<Relation> =>
    fact.relations
      .filter((relation) => relation.kind === "blocked_by")
      .map((relation) => ({
        key: `${fact.id}>${relation.to}`,
        from: fact.id,
        to: relation.to
      }))

  const apply = async (sync: ProjectSync) => {
    const upserts =
      sync.kind === "snapshot" ? sync.tickets : sync.upserts.tickets
    const deletes = sync.kind === "snapshot" ? [] : sync.deletes.tickets
    const staleRelations = [...deletes, ...upserts.map((t) => t.id)].flatMap(
      (id) => relationKeys.get(id) ?? []
    )
    const freshRelations = upserts.flatMap(relationRows)
    for (const id of deletes) relationKeys.delete(id)
    for (const fact of upserts)
      relationKeys.set(
        fact.id,
        relationRows(fact).map((r) => r.key)
      )
    tickets.replace(upserts.map(ticketRow), deletes)
    relations.replace(freshRelations, staleRelations)
    if (sync.kind === "snapshot")
      memberships.replace(
        sync.groups.flatMap((group) =>
          group.tickets.map((ticket) => ({
            key: `${group.id}>${ticket}`,
            group: group.id,
            ticket
          }))
        ),
        []
      )
  }

  return {
    name: "tanstack-db",
    apply,
    views,
    onChange: (listener) => {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
    roundTrip: async () => {},
    dispose: async () => {
      for (const subscription of subscriptions) subscription.unsubscribe()
      await Promise.all(all.map((c) => c.cleanup()))
    }
  }
}
