import * as SqliteClient from "@effect/sql-sqlite-wasm/SqliteClient"
import { it } from "@effect/vitest"
import {
  type EstimationMode,
  matchesTicketQuery,
  type ProjectSnapshot,
  type StatusFact,
  type TicketFact,
  TicketListQuery,
  TicketStatus,
  UserId
} from "@pp/shared"
import * as DateTime from "effect/DateTime"
import * as Effect from "effect/Effect"
import * as Layer from "effect/Layer"
import * as Schema from "effect/Schema"
import { expect } from "vitest"

import { localDbLayer } from "./LocalDb"
import { localOrderKey } from "./orderKey"
import { localSections } from "./sections"
import { copyOf } from "./store"
import { install } from "./testFacts"
import { finishedStatuses } from "./ticketRows"

const TestDatabase = localDbLayer.pipe(
  Layer.provideMerge(SqliteClient.layerMemory({}))
)

const random = (seed: number) => {
  let state = seed >>> 0
  return () => {
    state = (state * 1664525 + 1013904223) >>> 0
    return state / 2 ** 32
  }
}

const base = DateTime.makeUnsafe("2026-11-01T00:00:00Z")
const day = (n: number) => DateTime.toDateUtc(DateTime.add(base, { days: n }))

const STATUSES: ReadonlyArray<StatusFact> = [
  ["todo", "a0"],
  ["in_progress", "a1"],
  ["done", "a2"],
  ["shipped", "a3"],
  ["triage", "Zz"]
].map(([slug, orderKey]) => ({
  slug: slug ?? "",
  label: slug ?? "",
  icon: "circle",
  color: "#3b82f6",
  orderKey: orderKey ?? "",
  description: null
}))
const USERS = ["u1", "u2", "u3"]
const TAGS = ["bug", "ui", "api"]
const TYPES = [null, "feat", "bug", "chore"]
const SIZES = ["XS", "S", "M", "L", "XL"] as const

const generate = (size: number, seed: number): ReadonlyArray<TicketFact> => {
  const next = random(seed)
  const pick = <A>(values: ReadonlyArray<A>) =>
    values[Math.floor(next() * values.length)]
  const some = <A>(values: ReadonlyArray<A>) =>
    values.filter(() => next() < 0.3)
  return Array.from({ length: size }, (_, n): TicketFact => {
    const id = `T-${n + 1}`
    const roll = next()
    return {
      id,
      title: `${pick(["Fix", "Add", "Ship"])} ${pick(["login", "Board", "api"])} ${n}`,
      status: pick(STATUSES).slug,
      type: pick(TYPES),
      priority: pick(["low", "med", "high"] as const),
      rank: Math.floor(next() * 1e6)
        .toString(36)
        .padStart(4, "0"),
      estimate:
        roll < 0.3
          ? null
          : roll < 0.6
            ? { unit: "tshirt", value: pick(SIZES) }
            : roll < 0.8
              ? { unit: "points", value: 1 + Math.floor(next() * 8) }
              : { unit: "time", minutes: 30 + Math.floor(next() * 300) },
      tags: some(TAGS),
      assignees: some(USERS),
      parent: n > 3 && next() < 0.3 ? `T-${1 + Math.floor(next() * n)}` : null,
      relations: Array.from({ length: Math.floor(next() * 3) }, () => ({
        to: `T-${1 + Math.floor(next() * size)}`,
        kind: pick(["blocked_by", "related", "duplicate_of"] as const)
      })).filter(
        (r, i, all) =>
          r.to !== id &&
          all.findIndex((o) => o.to === r.to && o.kind === r.kind) === i
      ),
      flag: next() < 0.1 ? { by: "u1", at: day(1) } : null,
      git:
        next() < 0.3
          ? {
              repoId: null,
              branch: `feat/${id}`,
              pr: next() < 0.5 ? n : null,
              prState: null,
              prDraft: false,
              prBase: null,
              lastTransitionedPr: null,
              branchDeletedAt: null,
              checks: null
            }
          : null,
      archivedAt: next() < 0.1 ? day(2) : null,
      createdBy: "u1",
      createdAt: day(Math.floor(next() * 10)),
      updatedAt: day(Math.floor(next() * 10))
    }
  })
}

const decodeQuery = Schema.decodeUnknownSync(TicketListQuery)

const randomQuery = (next: () => number): TicketListQuery => {
  const maybe = <A>(value: () => A) => (next() < 0.25 ? value() : undefined)
  const subset = <A>(values: ReadonlyArray<A>) => {
    const chosen = values.filter(() => next() < 0.5)
    return chosen.length === 0 ? [values[0]] : chosen
  }
  return decodeQuery({
    status: maybe(() => subset(STATUSES.map((s) => s.slug))),
    type: maybe(() => subset(["none", "feat", "bug"])),
    excludeType: maybe(() => subset(["chore", "none"])),
    assignee: maybe(() => subset(["mine", "unassigned", "u2"])),
    tags: maybe(() => subset(TAGS)),
    hasBranch: maybe(() => next() < 0.5),
    hasPr: maybe(() => next() < 0.5),
    estimate: maybe(() => subset(["none", "any", "stale", "M", "L"])),
    parent: maybe(() => subset(["none", "T-2", "T-5"])),
    updatedAfter: maybe(() => day(5).toISOString()),
    archived: next() < 0.1 ? true : undefined,
    blocked: maybe(() => next() < 0.5),
    flagged: maybe(() => next() < 0.5),
    q: maybe(() => ["fix", "BOARD", "t-1", "api 1"][Math.floor(next() * 4)]),
    sort: {
      key: [
        "manual",
        "id",
        "created",
        "updated",
        "title",
        "priority",
        "estimate"
      ][Math.floor(next() * 7)],
      dir: next() < 0.5 ? "asc" : "desc"
    }
  })
}

const reference = (
  facts: ReadonlyArray<TicketFact>,
  query: TicketListQuery,
  viewer: string,
  estimation: EstimationMode,
  limit: number
) => {
  const finished = new Set(finishedStatuses(STATUSES))
  const byId = new Map(facts.map((f) => [f.id, f]))
  const open = (id: string) => {
    const other = byId.get(id)
    return (
      other !== undefined &&
      other.archivedAt === null &&
      !finished.has(other.status)
    )
  }
  const matching = facts.filter((fact) =>
    matchesTicketQuery(
      {
        id: fact.id,
        title: fact.title,
        status: TicketStatus.make(fact.status),
        type: fact.type,
        tags: fact.tags,
        branch: fact.git?.branch ?? null,
        pr: fact.git?.pr ?? null,
        assignees: fact.assignees,
        estimate: fact.estimate,
        parent: fact.parent === null ? null : { id: fact.parent },
        openBlockerCount: fact.relations.filter(
          (r) => r.kind === "blocked_by" && open(r.to)
        ).length,
        flag: fact.flag,
        archivedAt: fact.archivedAt,
        updatedAt: fact.updatedAt
      },
      query,
      UserId.make(viewer),
      estimation
    )
  )
  const counts: Record<string, number> = {}
  const sections: Record<string, ReadonlyArray<string>> = {}
  for (const status of new Set(matching.map((f) => f.status))) {
    const rows = matching
      .flatMap((f) =>
        f.status === status
          ? [{ id: f.id, key: localOrderKey(f, query.sort) }]
          : []
      )
      .toSorted((a, b) =>
        query.sort.dir === "desc"
          ? a.key < b.key
            ? 1
            : a.key > b.key
              ? -1
              : 0
          : a.key < b.key
            ? -1
            : a.key > b.key
              ? 1
              : 0
      )
    counts[status] = rows.length
    sections[status] = rows.slice(0, limit).map((r) => `${r.id}@${r.key}`)
  }
  return { counts, sections }
}

const snapshot = (
  tickets: ReadonlyArray<TicketFact>,
  estimation: EstimationMode
): ProjectSnapshot => ({
  kind: "snapshot",
  cursor: "1.1",
  project: {
    id: "p",
    key: "T",
    name: "P",
    icon: "folder",
    color: "blue",
    estimation
  },
  tickets,
  groups: [],
  statuses: STATUSES,
  tags: [],
  members: []
})

it.effect(
  "local sections, order and counts equal the shared filter and sort rules over random queries",
  () =>
    Effect.gen(function* () {
      const next = random(42)
      for (const [seed, estimation] of [
        [1, "tshirt"],
        [2, "points"],
        [3, "off"]
      ] as const) {
        const facts = generate(300, seed)
        yield* install(`a/${seed}`, snapshot(facts, estimation))
        const copy = (yield* copyOf(`a/${seed}`)) ?? -1
        for (let i = 0; i < 60; i++) {
          const query = randomQuery(next)
          const local = yield* localSections({
            copy,
            query,
            viewerId: "u1",
            estimation,
            repository: () => null,
            perStatus: () => 20
          })
          const expected = reference(facts, query, "u1", estimation, 20)
          expect(local).not.toBeNull()
          expect({
            counts: local?.counts.byStatus,
            sections: Object.fromEntries(
              Object.entries(local?.sections ?? {}).map(([status, page]) => [
                status,
                page.items.map((row) => `${row.ticket.id}@${row.orderKey}`)
              ])
            )
          }).toEqual(expected)
        }
      }
    }).pipe(Effect.provide(TestDatabase))
)

it.effect("leaves sprint filters to the server", () =>
  Effect.gen(function* () {
    yield* install("a/p", snapshot(generate(10, 1), "off"))
    const result = yield* localSections({
      copy: (yield* copyOf("a/p")) ?? -1,
      query: decodeQuery({ groupId: ["G-1"] }),
      viewerId: "u1",
      estimation: "off",
      repository: () => null,
      perStatus: () => 20
    })
    expect(result).toBeNull()
  }).pipe(Effect.provide(TestDatabase))
)
