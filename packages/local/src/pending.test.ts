import * as SqliteClient from "@effect/sql-sqlite-wasm/SqliteClient"
import { it } from "@effect/vitest"
import {
  type GroupFact,
  type ProjectSnapshot,
  TicketFact,
  TicketId,
  TicketPriority
} from "@pp/shared"
import { eq } from "drizzle-orm"
import * as DateTime from "effect/DateTime"
import * as Effect from "effect/Effect"
import * as Layer from "effect/Layer"
import * as Schema from "effect/Schema"
import { expect } from "vitest"

import { LocalDb, localDbLayer } from "./LocalDb"
import {
  applyIntents,
  Intent,
  type Membership,
  type PendingEdit,
  PendingWrite,
  placeholderTicketId,
  type TicketState
} from "./pending"
import {
  applyChanges,
  confirmEdit,
  copyOf,
  recordEdit,
  rejectEdit
} from "./store"
import { localGroupMembers, localTicketData } from "./tables"
import { changes, install, snapshot, ticket, direct } from "./testFacts"

const TestDatabase = localDbLayer.pipe(
  Layer.provideMerge(SqliteClient.layerMemory({}))
)

const decodeFact = Schema.decodeUnknownSync(Schema.fromJsonString(TicketFact))

const at = DateTime.toDateUtc(DateTime.makeUnsafe("2026-11-16T10:00:00Z"))

const sprint = (id: string, completed: boolean): GroupFact => ({
  id,
  kind: "sprint",
  name: id,
  color: "#000000",
  startsAt: null,
  endsAt: null,
  completedAt: completed ? at : null,
  createdBy: "user-1",
  createdAt: at,
  updatedAt: at,
  tickets: []
})

const visible = Effect.gen(function* () {
  const db = yield* LocalDb
  const copy = (yield* copyOf("a/p")) ?? -1
  const tickets = yield* db
    .select({ data: localTicketData.data })
    .from(localTicketData)
    .where(eq(localTicketData.copy, copy))
  const members = yield* db
    .select({
      group: localGroupMembers.groupId,
      ticket: localGroupMembers.ticket
    })
    .from(localGroupMembers)
    .where(eq(localGroupMembers.copy, copy))
  return {
    tickets: new Map(
      tickets.map((row) => {
        const fact = decodeFact(row.data)
        return [fact.id, fact]
      })
    ),
    members: members.map((row) => `${row.group}/${row.ticket}`).toSorted()
  }
})

const visibleTicket = (id: string) =>
  Effect.map(visible, (state) => state.tickets.get(id))

const priorityEdit = (
  id: string,
  ticketId: string,
  priority: TicketPriority
) => ({
  id,
  write: PendingWrite.cases.update.make({
    ticket: TicketId.make(ticketId),
    payload: { priority }
  }),
  edits: [
    {
      ticket: ticketId,
      intents: [Intent.cases.priority.make({ priority })]
    }
  ]
})

it.effect(
  "an edit stays over a teammate's change until the sync reaches its receipt",
  () =>
    Effect.gen(function* () {
      yield* install("a/p", snapshot("1.1", [ticket("T-1", "one")]))
      yield* recordEdit("a/p", priorityEdit("op-1", "T-1", "high"))
      yield* confirmEdit("a/p", "op-1", "project-1.1.3")

      yield* applyChanges(
        "a/p",
        "1.1",
        changes("1.2", [ticket("T-1", "renamed")], []),
        direct
      )
      expect(yield* visibleTicket("T-1")).toMatchObject({
        title: "renamed",
        priority: "high"
      })

      yield* applyChanges(
        "a/p",
        "1.2",
        changes("1.3", [{ ...ticket("T-1", "renamed"), priority: "low" }], []),
        direct
      )
      expect(yield* visibleTicket("T-1")).toMatchObject({
        title: "renamed",
        priority: "low"
      })
    }).pipe(Effect.provide(TestDatabase))
)

it.effect(
  "a rejected edit disappears without undoing a teammate's newer change",
  () =>
    Effect.gen(function* () {
      yield* install("a/p", snapshot("1.1", [ticket("T-1", "one")]))
      yield* recordEdit("a/p", priorityEdit("op-1", "T-1", "high"))
      yield* applyChanges(
        "a/p",
        "1.1",
        changes("1.2", [ticket("T-1", "renamed")], []),
        direct
      )

      yield* rejectEdit("a/p", "op-1")

      expect(yield* visibleTicket("T-1")).toMatchObject({
        title: "renamed",
        priority: "med"
      })
    }).pipe(Effect.provide(TestDatabase))
)

it.effect(
  "a created ticket shows at once and becomes the server's ticket when the sync reaches its receipt",
  () =>
    Effect.gen(function* () {
      yield* install("a/p", snapshot("1.1", [ticket("T-1", "one")]))
      const placeholder = placeholderTicketId("T", 0.5)
      yield* recordEdit("a/p", {
        id: "op-1",
        write: PendingWrite.cases.create.make({
          placeholder,
          payload: { title: "new" },
          sprint: null
        }),
        edits: [
          {
            ticket: placeholder,
            intents: [
              Intent.cases.create.make({ fact: ticket(placeholder, "new") })
            ]
          }
        ]
      })
      expect([...(yield* visible).tickets.keys()].toSorted()).toEqual([
        "T-1",
        placeholder
      ])

      yield* confirmEdit("a/p", "op-1", "project-1.1.2")
      yield* applyChanges(
        "a/p",
        "1.1",
        changes("1.2", [ticket("T-2", "new")], []),
        direct
      )

      expect([...(yield* visible).tickets.keys()].toSorted()).toEqual([
        "T-1",
        "T-2"
      ])
    }).pipe(Effect.provide(TestDatabase))
)

it("moving a ticket into a sprint takes it out of open sprints only", () => {
  const state: TicketState = {
    fact: ticket("T-1", "one"),
    groups: [
      { group: "S-open", position: 0 },
      { group: "S-done", position: 3 }
    ]
  }
  const moved = applyIntents(
    state,
    [Intent.cases.sprint.make({ sprint: "S-next" })],
    new Set(["S-open", "S-next"])
  )
  expect(moved?.groups.map((member) => member.group)).toEqual([
    "S-done",
    "S-next"
  ])
})

const random = (seed: number) => {
  let state = seed
  return () => {
    state = (state + 0x6d2b79f5) | 0
    let t = Math.imul(state ^ (state >>> 15), 1 | state)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

const TICKETS = ["T-1", "T-2", "T-3", "T-4"]
const SPRINTS = ["S-1", "S-2", "S-0"]
const OPEN = new Set(["S-1", "S-2"])

type Model = {
  facts: Map<string, TicketFact>
  sprints: Map<string, GroupFact>
}

const membershipsOf = (model: Model, id: string): ReadonlyArray<Membership> =>
  [...model.sprints.values()].flatMap((group) => {
    const position = group.tickets.indexOf(id)
    return position < 0 ? [] : [{ group: group.id, position }]
  })

const copyModel = (model: Model): Model => ({
  facts: new Map(model.facts),
  sprints: new Map(model.sprints)
})

const applyToModel = (
  model: Model,
  id: string,
  intents: ReadonlyArray<Intent>
) => {
  const fact = model.facts.get(id)
  if (fact === undefined) return
  const next = applyIntents(
    { fact, groups: membershipsOf(model, id) },
    intents,
    OPEN
  )
  if (next === null) return
  model.facts.set(id, next.fact)
  for (const group of model.sprints.values()) {
    const member = next.groups.some((m) => m.group === group.id)
    const listed = group.tickets.includes(id)
    if (member && !listed)
      model.sprints.set(group.id, {
        ...group,
        tickets: [...group.tickets, id]
      })
    if (!member && listed)
      model.sprints.set(group.id, {
        ...group,
        tickets: group.tickets.filter((ticketId) => ticketId !== id)
      })
  }
}

const expected = (model: Model, ops: ReadonlyArray<Op>) => {
  const result = copyModel(model)
  for (const op of ops)
    for (const edit of op.edits) applyToModel(result, edit.ticket, edit.intents)
  return {
    tickets: result.facts,
    members: [...result.sprints.values()]
      .flatMap((group) => group.tickets.map((id) => `${group.id}/${id}`))
      .toSorted()
  }
}

type Op = {
  id: string
  edits: ReadonlyArray<PendingEdit>
  receipt: number | null
}

const pick = <A>(next: () => number, items: ReadonlyArray<A>): A => {
  const item = items[Math.floor(next() * items.length)]
  if (item === undefined) throw new Error("picked from an empty list")
  return item
}

const randomIntent = (next: () => number): Intent =>
  pick<() => Intent>(next, [
    () =>
      Intent.cases.status.make({
        status: pick(next, ["todo", "doing", "done"])
      }),
    () =>
      Intent.cases.priority.make({
        priority: pick(next, TicketPriority.literals)
      }),
    () =>
      Intent.cases.tags.make({
        edit:
          next() < 0.5
            ? { add: [pick(next, ["bug", "ui"])] }
            : { remove: [pick(next, ["bug", "ui"])] }
      }),
    () => Intent.cases.assignees.make({ edit: [pick(next, ["u-1", "u-2"])] }),
    () => Intent.cases.rank.make({ rank: pick(next, ["a", "m", "z"]) }),
    () =>
      Intent.cases.sprint.make({ sprint: pick(next, ["S-1", "S-2", null]) }),
    () => Intent.cases.parent.make({ parent: pick(next, ["T-1", null]) }),
    () =>
      Intent.cases.estimate.make({
        estimate: next() < 0.5 ? null : { unit: "points", value: 3 }
      })
  ])()

const randomEdits = (next: () => number): ReadonlyArray<PendingEdit> =>
  [...new Set([pick(next, TICKETS), pick(next, TICKETS)])].map((id) => ({
    ticket: id,
    intents: [randomIntent(next), randomIntent(next)]
  }))

const run = (seed: number) =>
  Effect.gen(function* () {
    const next = random(seed)
    const server: Model = {
      facts: new Map(TICKETS.map((id) => [id, ticket(id, id)])),
      sprints: new Map([
        ["S-1", { ...sprint("S-1", false), tickets: ["T-1"] }],
        ["S-2", sprint("S-2", false)],
        ["S-0", { ...sprint("S-0", true), tickets: ["T-2"] }]
      ])
    }
    const log: Array<Readonly<{ tickets: Set<string>; groups: Set<string> }>> =
      []
    const full: ProjectSnapshot = {
      ...snapshot("1.0", [...server.facts.values()]),
      groups: [...server.sprints.values()]
    }
    yield* install("a/p", full)
    let synced = copyModel(server)
    let cursor = 0
    let ops: Array<Op> = []
    let opCount = 0

    const record = (before: Model, after: Model) => {
      const tickets = new Set(
        TICKETS.filter((id) => before.facts.get(id) !== after.facts.get(id))
      )
      const groups = new Set(
        SPRINTS.filter((id) => before.sprints.get(id) !== after.sprints.get(id))
      )
      log.push({ tickets, groups })
      return log.length
    }

    for (let step = 0; step < 60; step++) {
      const roll = next()
      if (roll < 0.3) {
        const op = { id: `op-${++opCount}`, edits: randomEdits(next) }
        ops.push({ ...op, receipt: null })
        yield* recordEdit("a/p", {
          ...op,
          write: PendingWrite.cases.bulk.make({
            payload: {
              tickets: op.edits.map((edit) => TicketId.make(edit.ticket)),
              patch: {}
            }
          })
        })
      } else if (roll < 0.45) {
        const unsent = ops.filter((op) => op.receipt === null)
        if (unsent.length === 0) continue
        const op = pick(next, unsent)
        const before = copyModel(server)
        for (const edit of op.edits)
          applyToModel(server, edit.ticket, edit.intents)
        const receipt = record(before, server)
        op.receipt = receipt
        yield* confirmEdit("a/p", op.id, `project-1.1.${receipt}`)
      } else if (roll < 0.55) {
        const unsent = ops.filter((op) => op.receipt === null)
        if (unsent.length === 0) continue
        const op = pick(next, unsent)
        ops = ops.filter((other) => other !== op)
        yield* rejectEdit("a/p", op.id)
      } else if (roll < 0.6) {
        yield* install("a/p", {
          ...snapshot(`1.${log.length}`, [...server.facts.values()]),
          groups: [...server.sprints.values()]
        })
        cursor = log.length
        synced = copyModel(server)
        ops = ops.filter((op) => op.receipt === null || op.receipt > cursor)
      } else if (roll < 0.75) {
        const before = copyModel(server)
        applyToModel(server, pick(next, TICKETS), [randomIntent(next)])
        record(before, server)
      } else {
        const head = log.length
        if (head === cursor) continue
        const touched = log.slice(cursor)
        const tickets = new Set<string>()
        const groups = new Set<string>()
        for (const entry of touched) {
          for (const id of entry.tickets) tickets.add(id)
          for (const id of entry.groups) groups.add(id)
        }
        const batch = changes(
          `1.${head}`,
          [...tickets].flatMap((id) => server.facts.get(id) ?? []),
          []
        )
        yield* applyChanges(
          "a/p",
          `1.${cursor}`,
          {
            ...batch,
            upserts: {
              ...batch.upserts,
              groups: [...groups].flatMap((id) => server.sprints.get(id) ?? [])
            }
          },
          direct
        )
        cursor = head
        synced = copyModel(server)
        ops = ops.filter((op) => op.receipt === null || op.receipt > cursor)
      }
      const want = expected(synced, ops)
      const got = yield* visible
      expect(got.members).toEqual(want.members)
      expect(got.tickets).toEqual(want.tickets)
    }
  })

it.effect(
  "the visible rows always equal the synced facts plus the remaining edits",
  () =>
    Effect.gen(function* () {
      for (let seed = 1; seed <= 40; seed++)
        yield* run(seed).pipe(Effect.provide(TestDatabase))
    }),
  30_000
)
