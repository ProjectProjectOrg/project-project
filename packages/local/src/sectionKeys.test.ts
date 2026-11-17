import * as SqliteClient from "@effect/sql-sqlite-wasm/SqliteClient"
import * as SqliteMigrator from "@effect/sql-sqlite-wasm/SqliteMigrator"
import { it } from "@effect/vitest"
import {
  type GroupFact,
  type ProjectChanges,
  type SnapshotPage,
  type TicketFact,
  TicketId,
  TicketListQuery
} from "@pp/shared"
import * as Effect from "effect/Effect"
import * as Layer from "effect/Layer"
import * as Schema from "effect/Schema"
import * as SqlClient from "effect/sql/SqlClient"
import { expect } from "vitest"

import { localDbLayer } from "./LocalDb"
import { localMigrations } from "./migrations"
import { localParentSections } from "./parents"
import { Intent, PendingWrite } from "./pending"
import { at, sprintFact } from "./sprintFacts"
import { localSprintSections } from "./sprints"
import {
  applyChanges,
  applyPage,
  beginStaging,
  confirmEdit,
  copyOf,
  publishStaging,
  recordEdit,
  rejectEdit
} from "./store"
import {
  changes,
  install,
  pageOf,
  snapshot,
  ticket,
  direct,
  directly
} from "./testFacts"

const TestDatabase = localDbLayer.pipe(
  Layer.provideMerge(SqliteClient.layerMemory({}))
)

const now = at("2026-11-16T12:00:00Z")
const query = Schema.decodeSync(TicketListQuery)({})

const sprintView = Effect.gen(function* () {
  const result = yield* localSprintSections({
    copy: (yield* copyOf("a/p")) ?? -1,
    query,
    viewerId: "user-1",
    estimation: "off",
    repository: () => null,
    pages: {},
    pageSize: 50,
    now
  })
  return Object.fromEntries(
    (result?.sections ?? []).map((section) => [
      section.key,
      section.page.items.map((item) => item.ticket.id)
    ])
  )
})

const epicView = Effect.gen(function* () {
  const result = yield* localParentSections({
    copy: (yield* copyOf("a/p")) ?? -1,
    by: "epic",
    query,
    viewerId: "user-1",
    estimation: "off",
    repository: () => null,
    pages: {},
    pageSize: 50,
    now
  })
  return Object.fromEntries(
    (result?.sections ?? []).map((section) => [
      section.key,
      section.page.items.map((item) => item.ticket.id)
    ])
  )
})

const withGroups = (
  base: ProjectChanges,
  upserts: ReadonlyArray<GroupFact>,
  deletes: ReadonlyArray<string> = []
): ProjectChanges => ({
  ...base,
  upserts: { ...base.upserts, groups: upserts },
  deletes: { ...base.deletes, groups: deletes }
})

const older = sprintFact("G-1", ["T-1"], {
  createdAt: at("2026-11-01T00:00:00Z")
})
const newer = sprintFact("G-2", ["T-1"], {
  createdAt: at("2026-11-05T00:00:00Z")
})

it.effect(
  "a new sprint takes a ticket from an older one, and completing it gives the ticket back",
  () =>
    Effect.gen(function* () {
      yield* install("a/p", {
        ...snapshot("1.1", [ticket("T-1", "one")]),
        groups: [older]
      })
      yield* applyChanges(
        "a/p",
        "1.1",
        withGroups(changes("1.2", [], []), [newer]),
        direct
      )
      expect(yield* sprintView).toMatchObject({ "G-1": [], "G-2": ["T-1"] })

      yield* applyChanges(
        "a/p",
        "1.2",
        withGroups(changes("1.3", [], []), [
          { ...newer, completedAt: at("2026-11-10T00:00:00Z") }
        ]),
        direct
      )
      expect(yield* sprintView).toMatchObject({ "G-1": ["T-1"], "G-2": [] })
    }).pipe(Effect.provide(TestDatabase))
)

it.effect("deleting a sprint releases its tickets", () =>
  Effect.gen(function* () {
    yield* install("a/p", {
      ...snapshot("1.1", [ticket("T-1", "one")]),
      groups: [older]
    })
    yield* applyChanges(
      "a/p",
      "1.1",
      withGroups(changes("1.2", [], []), [], ["G-1"]),
      direct
    )
    expect(yield* sprintView).toEqual({ unscheduled: ["T-1"] })
  }).pipe(Effect.provide(TestDatabase))
)

it.effect("a ticket that arrives after its sprint membership is claimed", () =>
  Effect.gen(function* () {
    yield* install("a/p", snapshot("1.1", [ticket("T-1", "one")]))
    yield* applyChanges(
      "a/p",
      "1.1",
      {
        ...withGroups(changes("1.2", [], []), [
          sprintFact("G-1", ["T-1", "T-2"])
        ]),
        more: true
      },
      direct
    )
    yield* applyChanges(
      "a/p",
      "1.2",
      changes("1.3", [ticket("T-2", "two")], []),
      direct
    )
    expect(yield* sprintView).toMatchObject({ "G-1": ["T-1", "T-2"] })
  }).pipe(Effect.provide(TestDatabase))
)

it.effect(
  "a parent becoming an epic moves its children, and deleting it clears them",
  () =>
    Effect.gen(function* () {
      const child = { ...ticket("T-2", "child"), parent: "T-1" }
      yield* install("a/p", snapshot("1.1", [ticket("T-1", "parent"), child]))
      expect(yield* epicView).toEqual({ none: ["T-1", "T-2"] })

      yield* applyChanges(
        "a/p",
        "1.1",
        changes("1.2", [{ ...ticket("T-1", "parent"), type: "epic" }], []),
        direct
      )
      expect(yield* epicView).toEqual({ "T-1": ["T-2"], none: [] })

      yield* applyChanges("a/p", "1.2", changes("1.3", [], ["T-1"]), direct)
      expect(yield* epicView).toEqual({ none: ["T-2"] })
    }).pipe(Effect.provide(TestDatabase))
)

const edit = (id: string, intent: Intent) => ({
  id,
  write: PendingWrite.cases.update.make({
    ticket: TicketId.make("T-1"),
    payload: {}
  }),
  edits: [{ ticket: "T-1", intents: [intent] }]
})

it.effect(
  "a pending sprint or parent edit shows in the sections until it is rejected",
  () =>
    Effect.gen(function* () {
      yield* install("a/p", {
        ...snapshot("1.1", [
          ticket("T-1", "one"),
          { ...ticket("T-9", "epic"), type: "epic" }
        ]),
        groups: [sprintFact("G-1", [])]
      })
      yield* recordEdit(
        "a/p",
        edit("op-1", Intent.cases.sprint.make({ sprint: "G-1" }))
      )
      yield* recordEdit(
        "a/p",
        edit("op-2", Intent.cases.parent.make({ parent: "T-9" }))
      )
      expect(yield* sprintView).toMatchObject({ "G-1": ["T-1"] })
      expect(yield* epicView).toMatchObject({ "T-9": ["T-1"] })

      yield* rejectEdit("a/p", "op-1")
      yield* rejectEdit("a/p", "op-2")
      expect(yield* sprintView).toMatchObject({ "G-1": [] })
      expect(yield* epicView).toMatchObject({ "T-9": [], none: ["T-1"] })
    }).pipe(Effect.provide(TestDatabase))
)

const pagedSnapshot = (
  cursor: string,
  tickets: ReadonlyArray<TicketFact>,
  groups: ReadonlyArray<GroupFact>
) => {
  const whole = pageOf({ ...snapshot(cursor, tickets), groups })
  const half = Math.ceil(tickets.length / 2)
  const members = Math.ceil(whole.groupMembers.length / 2)
  const first: SnapshotPage = {
    ...whole,
    tickets: whole.tickets.slice(0, half),
    groupMembers: whole.groupMembers.slice(0, members),
    next: "page-2"
  }
  const second: SnapshotPage = {
    ...whole,
    start: null,
    tickets: whole.tickets.slice(half),
    groupMembers: whole.groupMembers.slice(members),
    next: null
  }
  return [first, second] as const
}

const installPaged = (pages: ReturnType<typeof pagedSnapshot>) =>
  Effect.gen(function* () {
    yield* beginStaging("a/p", pages[0], directly)
    yield* applyPage("a/p", "page-2", pages[1], directly)
    yield* publishStaging("a/p", directly)
  })

it.effect("a paged snapshot gets its sections when it is published", () =>
  Effect.gen(function* () {
    yield* installPaged(
      pagedSnapshot(
        "1.1",
        [
          { ...ticket("T-1", "child"), parent: "T-2" },
          { ...ticket("T-2", "epic"), type: "epic" }
        ],
        [sprintFact("G-1", ["T-2", "T-1"])]
      )
    )
    expect(yield* sprintView).toMatchObject({ "G-1": ["T-1", "T-2"] })
    expect(yield* epicView).toMatchObject({ "T-2": ["T-1"] })
  }).pipe(Effect.provide(TestDatabase))
)

it.effect("the migration gives an existing copy its sections", () =>
  Effect.gen(function* () {
    const sql = yield* SqlClient.SqlClient
    yield* install("a/p", {
      ...snapshot("1.1", [
        { ...ticket("T-1", "child"), parent: "T-2" },
        { ...ticket("T-2", "epic"), type: "epic" }
      ]),
      groups: [sprintFact("G-1", ["T-1"])]
    })
    for (const index of [
      "local_tickets_sprint",
      "local_tickets_epic_section",
      "local_tickets_parent_section",
      "local_tickets_epics"
    ])
      yield* sql.unsafe(`drop index ${index}`)
    for (const column of ["sprint", "epic_section", "parent_section"])
      yield* sql.unsafe(`alter table local_tickets drop column ${column}`)
    yield* sql`delete from effect_sql_migrations where migration_id = 7`

    yield* SqliteMigrator.run({ loader: localMigrations })

    expect(yield* sprintView).toMatchObject({ "G-1": ["T-1"] })
    expect(yield* epicView).toMatchObject({ "T-2": ["T-1"] })
  }).pipe(Effect.provide(TestDatabase))
)

const random = (seed: number) => {
  let state = seed
  return () => {
    state = (state * 1664525 + 1013904223) >>> 0
    return state / 2 ** 32
  }
}

const TICKETS = Array.from({ length: 12 }, (_, index) => `T-${index + 1}`)
const GROUPS = ["G-1", "G-2", "G-9", "G-10", "M-1"]
const DATES = [
  "2026-11-01T00:00:00Z",
  "2026-11-03T00:00:00Z",
  "2026-11-03T00:00:00Z"
]

const stale = Effect.gen(function* () {
  const sql = yield* SqlClient.SqlClient
  return yield* sql<{ id: string }>`select t.id from local_tickets t
    where t.copy = (select copy from local_sync where scope = 'a/p')
      and (t.sprint is not (select m.group_id from local_group_members m
          join local_groups g on g.copy = m.copy and g.id = m.group_id
          where m.copy = t.copy and m.ticket = t.id and g.data ->> 'kind' = 'sprint'
          order by g.data ->> 'completedAt' is not null,
            g.data ->> 'createdAt' desc, length(g.id), g.id limit 1)
        or t.epic_section is not (select case when p.type = 'epic' then p.id else p.parent end
          from local_tickets p where p.copy = t.copy and p.id = t.parent)
        or t.parent_section is not (select p.id from local_tickets p
          where p.copy = t.copy and p.id = t.parent and p.type is not 'epic'))`
})

const run = (seed: number) =>
  Effect.gen(function* () {
    const next = random(seed)
    const pick = <A>(items: ReadonlyArray<A>): A => {
      const item = items[Math.floor(next() * items.length)]
      if (item === undefined) throw new Error("picked from an empty list")
      return item
    }
    const randomTicket = (id: string): TicketFact => ({
      ...ticket(id, id),
      type: next() < 0.3 ? "epic" : next() < 0.5 ? "feat" : null,
      parent: next() < 0.6 ? pick(TICKETS) : null,
      archivedAt: next() < 0.1 ? at("2026-11-02T00:00:00Z") : null
    })
    const randomGroup = (id: string): GroupFact => ({
      ...sprintFact(
        id,
        [...new Set(Array.from({ length: 4 }, () => pick(TICKETS)))],
        {
          createdAt: at(pick(DATES)),
          completedAt: next() < 0.3 ? at("2026-11-10T00:00:00Z") : null
        }
      ),
      kind: id.startsWith("M") ? "milestone" : "sprint"
    })
    const tickets = new Map(TICKETS.map((id) => [id, randomTicket(id)]))
    const groups = new Map(GROUPS.map((id) => [id, randomGroup(id)]))
    let cursor = 1
    let ops = 0
    const unsent: Array<string> = []
    yield* installPaged(
      pagedSnapshot(`1.${cursor}`, [...tickets.values()], [...groups.values()])
    )
    for (let step = 0; step < 40; step++) {
      const roll = next()
      if (roll < 0.1) {
        cursor++
        yield* installPaged(
          pagedSnapshot(
            `1.${cursor}`,
            [...tickets.values()],
            [...groups.values()]
          )
        )
      } else if (roll < 0.55) {
        const upserted = [...new Set([pick(TICKETS), pick(TICKETS)])]
        const deleted = next() < 0.2 ? [pick(TICKETS)] : []
        const touched = next() < 0.5 ? [pick(GROUPS)] : []
        const dropped = next() < 0.15 ? [pick(GROUPS)] : []
        for (const id of upserted) tickets.set(id, randomTicket(id))
        for (const id of deleted) tickets.delete(id)
        for (const id of touched) groups.set(id, randomGroup(id))
        for (const id of dropped) groups.delete(id)
        const batch = changes(
          `1.${cursor + 1}`,
          upserted.flatMap((id) => tickets.get(id) ?? []),
          deleted
        )
        yield* applyChanges(
          "a/p",
          `1.${cursor}`,
          withGroups(
            { ...batch, more: next() < 0.3 },
            touched.flatMap((id) => groups.get(id) ?? []),
            dropped.filter((id) => !groups.has(id))
          ),
          direct
        )
        cursor++
      } else if (roll < 0.8) {
        const id = `op-${++ops}`
        unsent.push(id)
        yield* recordEdit("a/p", {
          id,
          write: PendingWrite.cases.update.make({
            ticket: TicketId.make("T-1"),
            payload: {}
          }),
          edits: [
            {
              ticket: pick(TICKETS),
              intents: [
                next() < 0.5
                  ? Intent.cases.sprint.make({
                      sprint: pick([...GROUPS, null])
                    })
                  : Intent.cases.parent.make({
                      parent: pick([...TICKETS, null])
                    })
              ]
            }
          ]
        })
      } else if (unsent.length > 0) {
        const id = unsent.splice(Math.floor(next() * unsent.length), 1)[0]
        if (id === undefined) continue
        if (next() < 0.5) yield* rejectEdit("a/p", id)
        else yield* confirmEdit("a/p", id, `project-1.1.${cursor + 1}`)
      }
      expect({ seed, step, stale: yield* stale }).toEqual({
        seed,
        step,
        stale: []
      })
    }
  })

it.effect(
  "the stored sections always equal a fresh derive of the visible rows",
  () =>
    Effect.gen(function* () {
      for (let seed = 1; seed <= 30; seed++)
        yield* run(seed).pipe(Effect.provide(TestDatabase))
    })
)
