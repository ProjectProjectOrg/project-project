import { it } from "@effect/vitest"
import {
  DEFAULT_TICKET_SORT,
  NotFound,
  TICKET_LIST_LIMIT,
  type TicketListQuery,
  TypeKey,
  TicketRank
} from "@pp/shared"
import * as DateTime from "effect/DateTime"
import * as Effect from "effect/Effect"
import * as Layer from "effect/Layer"
import { expect } from "vitest"

import {} from "../github/GitHub"
import {
  decodeGroupSync,
  isoDate,
  ticketStatus,
  githubIntegration,
  ticketIndexProject,
  makeTicketDocument,
  makeFakeTicketDocs,
  makeFakeProjects,
  makeFakeProjectGithub,
  makeFakeGroups,
  makeFakeTicketIndex,
  makeTicketsLayer,
  makeTicketsFixture,
  scopeAs,
  permissionFixture,
  as
} from "./testing"
import * as TicketCommands from "./TicketCommands"
import * as TicketDocs from "./TicketDocs"
import * as TicketQueries from "./TicketQueries"

it.effect(
  "textSearch finds rendered words across markdown and decoded titles",
  () => {
    const files = new Map([
      ["T-1", "---\ntitle: Formatting\n---\n**perf**authentication"],
      ["T-2", "---\ntitle: Mention\n---\nAsk [Luuk](mention:user/u_1)."],
      ["T-3", "---\ntitle: Link\n---\nperf[render](https://example.com)ing"],
      ["T-4", '---\ntitle: "\\u0063ache"\n---\nDescription']
    ])
    const docs = makeFakeTicketDocs([...files.keys()])
    const layer = makeTicketsLayer(
      "T",
      Layer.succeed(TicketDocs.TicketDocs, {
        ...docs.service,
        readRaw: (_org, _slug, id) => {
          const content = files.get(id)
          return content === undefined
            ? Effect.fail(new NotFound())
            : Effect.succeed({ path: id, content })
        }
      })
    )

    return Effect.gen(function* () {
      const queries = yield* TicketQueries.TicketQueries
      const results = yield* Effect.forEach(
        ["perfauthentication", "@Luuk", "perfrendering", "cache"],
        (q) => queries.textSearch({ q })
      )
      expect(results.map((hits) => hits.map((hit) => hit.id))).toEqual([
        ["T-1"],
        ["T-2"],
        ["T-3"],
        ["T-4"]
      ])
    }).pipe(Effect.provide(layer))
  }
)

it.effect(
  "textSearch keeps the best matches when stronger hits finish later",
  () => {
    const files = new Map([
      ["T-2", "---\ntitle: needle\n---\n"],
      ["T-100", "---\ntitle: Body\n---\nneedle"],
      ["T-1", "---\ntitle: needle\n---\n"],
      ["T-200", "---\ntitle: Another body\n---\nneedle"],
      ["T-10", "---\ntitle: needle\n---\n"]
    ])
    const docs = makeFakeTicketDocs([...files.keys()])
    const layer = makeTicketsLayer(
      "T",
      Layer.succeed(TicketDocs.TicketDocs, {
        ...docs.service,
        readRaw: (_org, _slug, id) => {
          const content = files.get(id)
          if (content === undefined) return Effect.fail(new NotFound())
          const file = Effect.succeed({ path: id, content })
          return id === "T-10"
            ? Effect.yieldNow.pipe(Effect.andThen(file))
            : file
        }
      })
    )

    return Effect.gen(function* () {
      const queries = yield* TicketQueries.TicketQueries
      const limited = yield* queries.textSearch({ q: "needle", limit: 3 })
      expect(limited.map((hit) => hit.id)).toEqual(["T-10", "T-2", "T-1"])

      const all = yield* queries.textSearch({ q: "needle", limit: 50 })
      expect(all.map((hit) => hit.id)).toEqual([
        "T-10",
        "T-2",
        "T-1",
        "T-200",
        "T-100"
      ])
    }).pipe(Effect.provide(layer))
  }
)

it.effect("get uses persisted prState for the fallback git state", () => {
  const docs = makeFakeTicketDocs(["T-1"])
  docs.documents.set(
    "T-1",
    makeTicketDocument("T-1", {
      branch: "feat/T-1",
      pr: 80,
      prState: "merged",
      status: ticketStatus("done")
    })
  )
  const layer = makeTicketsLayer("T", docs.layer, {
    projects: makeFakeProjects("T"),
    projectGithub: makeFakeProjectGithub({
      integration: () => Effect.succeed(githubIntegration)
    })
  })

  return Effect.gen(function* () {
    const queries = yield* TicketQueries.TicketQueries
    const ticket = yield* queries.get("T-1")

    expect(ticket.gitState).toEqual({
      tag: "pr_merged",
      branch: "feat/T-1",
      baseBranch: "main",
      number: 80,
      url: "https://github.com/acme/app/pull/80",
      title: "",
      mergedAt: null
    })
  }).pipe(Effect.provide(layer))
})

it.effect("get shows the recorded PR base before a git refresh", () => {
  const docs = makeFakeTicketDocs(["T-1"])
  docs.documents.set(
    "T-1",
    makeTicketDocument("T-1", {
      branch: "feat/T-1",
      pr: 81,
      prState: "open",
      prBase: "feat/T-0"
    })
  )
  const layer = makeTicketsLayer("T", docs.layer, {
    projectGithub: makeFakeProjectGithub({
      integration: () => Effect.succeed(githubIntegration)
    })
  })

  return Effect.gen(function* () {
    const ticket = yield* (yield* TicketQueries.TicketQueries).get("T-1")
    expect(ticket.gitState).toMatchObject({
      tag: "pr_pending",
      baseBranch: "feat/T-0"
    })
  }).pipe(Effect.provide(layer))
})

it.effect("list reads ticket index rows", () => {
  const docs = makeFakeTicketDocs(["T-1"])

  return Effect.gen(function* () {
    const queries = yield* TicketQueries.TicketQueries
    const result = yield* queries.list({
      sort: DEFAULT_TICKET_SORT
    })

    expect(result.items.map((row) => row.ticket.id)).toEqual(["T-1"])
    expect(result.nextCursor).toBeNull()
  }).pipe(
    Effect.provide(
      makeTicketsLayer("T", docs.layer, {
        ticketIndex: makeFakeTicketIndex(docs.documents)
      })
    )
  )
})

it.effect(
  "list resolves the ungrouped filter without treating it as a group id",
  () => {
    const docs = makeFakeTicketDocs(["T-1", "T-2"])
    const activeSprint = decodeGroupSync({
      id: "G-1",
      name: "Sprint",
      kind: "sprint",
      tickets: ["T-1"],
      color: "#123456",
      startsAt: null,
      endsAt: null,
      completedAt: null,
      createdBy: "user-1",
      createdAt: "2026-04-01T00:00:00.000Z",
      updatedAt: "2026-04-01T00:00:00.000Z"
    })
    const epic = decodeGroupSync({
      id: "G-2",
      name: "Epic",
      kind: "epic",
      tickets: ["T-2"],
      color: "#654321",
      startsAt: null,
      endsAt: null,
      completedAt: null,
      createdBy: "user-1",
      createdAt: "2026-04-01T00:00:00.000Z",
      updatedAt: "2026-04-01T00:00:00.000Z"
    })
    const groups = makeFakeGroups({
      list: () => Effect.succeed([activeSprint, epic])
    })

    return Effect.gen(function* () {
      const queries = yield* TicketQueries.TicketQueries
      const result = yield* queries.list({
        sort: DEFAULT_TICKET_SORT,
        groupId: ["ungrouped"]
      })

      expect(result.items.map((row) => row.ticket.id)).toEqual(["T-2"])
    }).pipe(
      Effect.provide(
        makeTicketsLayer("T", docs.layer, {
          groups,
          ticketIndex: makeFakeTicketIndex(docs.documents)
        })
      )
    )
  }
)

it.effect("list ungrouped filter excludes tickets in a planned sprint", () => {
  const docs = makeFakeTicketDocs(["T-1", "T-2"])
  const plannedSprint = decodeGroupSync({
    id: "G-1",
    name: "Planned",
    kind: "sprint",
    tickets: ["T-1"],
    color: "#123456",
    startsAt: "2099-01-01T00:00:00.000Z",
    endsAt: "2099-01-15T00:00:00.000Z",
    completedAt: null,
    createdBy: "user-1",
    createdAt: "2026-04-01T00:00:00.000Z",
    updatedAt: "2026-04-01T00:00:00.000Z"
  })
  const groups = makeFakeGroups({
    list: () => Effect.succeed([plannedSprint])
  })

  return Effect.gen(function* () {
    const queries = yield* TicketQueries.TicketQueries
    const result = yield* queries.list({
      sort: DEFAULT_TICKET_SORT,
      groupId: ["ungrouped"]
    })

    expect(result.items.map((row) => row.ticket.id)).toEqual(["T-2"])
  }).pipe(
    Effect.provide(
      makeTicketsLayer("T", docs.layer, {
        groups,
        ticketIndex: makeFakeTicketIndex(docs.documents)
      })
    )
  )
})

it.effect("list defaults to the manual order", () => {
  const { documents, layer } = makeTicketsFixture("T", [])
  documents.set(
    "T-1",
    makeTicketDocument("T-1", { title: "third", rank: TicketRank.make("a2") })
  )
  documents.set(
    "T-2",
    makeTicketDocument("T-2", { title: "first", rank: TicketRank.make("a0") })
  )
  documents.set(
    "T-3",
    makeTicketDocument("T-3", { title: "second", rank: TicketRank.make("a1") })
  )

  return Effect.gen(function* () {
    const queries = yield* TicketQueries.TicketQueries
    const result = yield* queries.list({
      sort: DEFAULT_TICKET_SORT
    })

    expect(result.items.map((row) => row.ticket.title)).toEqual([
      "first",
      "second",
      "third"
    ])
    expect(result.nextCursor).toBeNull()
  }).pipe(Effect.provide(layer))
})

it.effect("list sorts by title asc", () => {
  const { documents, layer } = makeTicketsFixture("T", [])
  documents.set("T-1", makeTicketDocument("T-1", { title: "C" }))
  documents.set("T-2", makeTicketDocument("T-2", { title: "A" }))
  documents.set("T-3", makeTicketDocument("T-3", { title: "B" }))

  return Effect.gen(function* () {
    const queries = yield* TicketQueries.TicketQueries
    const query: TicketListQuery = {
      sort: { key: "title", dir: "asc" }
    }
    const result = yield* queries.list(query)

    expect(result.items.map((row) => row.ticket.title)).toEqual(["A", "B", "C"])
  }).pipe(Effect.provide(layer))
})

it.effect("list paginates by cursor", () => {
  const { layer } = makeTicketsFixture("T", [])
  const total = TICKET_LIST_LIMIT + 5
  return Effect.gen(function* () {
    const tickets = yield* TicketCommands.TicketCommands
    const queries = yield* TicketQueries.TicketQueries
    for (let i = 0; i < total; i++) {
      yield* tickets.create({ title: `t-${i}` })
    }

    const sortById: TicketListQuery = {
      sort: { key: "id", dir: "asc" }
    }
    const page1 = yield* queries.list(sortById)
    expect(page1.items.length).toBe(TICKET_LIST_LIMIT)
    expect(page1.nextCursor).not.toBeNull()

    const page2 = yield* queries.list({
      ...sortById,
      cursor: page1.nextCursor ?? undefined
    })
    expect(page2.items.length).toBe(5)
    expect(page2.nextCursor).toBeNull()

    const page1Ids = new Set(page1.items.map((row) => row.ticket.id))
    for (const row of page2.items) {
      expect(page1Ids.has(row.ticket.id)).toBe(false)
    }
  }).pipe(Effect.provide(layer))
})

it.effect("list paginates by cursor with created desc sort", () => {
  const { documents, layer } = makeTicketsFixture("T", [])
  const total = TICKET_LIST_LIMIT + 5
  const base = DateTime.makeUnsafe("2026-01-01T00:00:00.000Z")
  for (let i = 0; i < total; i++) {
    const id = `T-${i + 1}`
    documents.set(
      id,
      makeTicketDocument(id, {
        title: id,
        createdAt: DateTime.toDate(DateTime.addDuration(`${i} hours`)(base))
      })
    )
  }

  const createdDesc = { key: "created", dir: "desc" } as const
  return Effect.gen(function* () {
    const queries = yield* TicketQueries.TicketQueries
    const page1 = yield* queries.list({
      sort: createdDesc
    })
    expect(page1.items.length).toBe(TICKET_LIST_LIMIT)
    expect(page1.nextCursor).not.toBeNull()
    const page1Times = page1.items.map((row) => row.ticket.createdAt.getTime())
    for (let i = 1; i < page1Times.length; i++) {
      expect(page1Times[i - 1]).toBeGreaterThan(page1Times[i])
    }

    const page2 = yield* queries.list({
      sort: createdDesc,
      cursor: page1.nextCursor ?? undefined
    })
    expect(page2.items.length).toBe(5)
    expect(page2.nextCursor).toBeNull()
    const page2Times = page2.items.map((row) => row.ticket.createdAt.getTime())
    for (let i = 1; i < page2Times.length; i++) {
      expect(page2Times[i - 1]).toBeGreaterThan(page2Times[i])
    }

    const seen = new Set(page1.items.map((row) => row.ticket.id))
    for (const row of page2.items) {
      expect(seen.has(row.ticket.id)).toBe(false)
    }
  }).pipe(Effect.provide(layer))
})

it.effect("list honors an explicit limit override", () => {
  const { layer } = makeTicketsFixture("T", [])
  return Effect.gen(function* () {
    const tickets = yield* TicketCommands.TicketCommands
    const queries = yield* TicketQueries.TicketQueries
    for (let i = 0; i < 10; i++) {
      yield* tickets.create({ title: `t-${i}` })
    }

    const page = yield* queries.list({ sort: { key: "id", dir: "asc" } }, 3)
    expect(page.items.length).toBe(3)
    expect(page.nextCursor).not.toBeNull()
  }).pipe(Effect.provide(layer))
})

it.effect("list filters by q and substitutes mine to viewerId", () => {
  const { layer } = makeTicketsFixture("T", [])
  return Effect.gen(function* () {
    const tickets = yield* TicketCommands.TicketCommands
    const queries = yield* TicketQueries.TicketQueries
    yield* tickets.create({
      title: "hello world",
      assignees: ["user-1"]
    })
    yield* tickets.create({
      title: "goodbye world",
      assignees: ["user-2"]
    })

    const byQ = yield* queries.list({
      sort: DEFAULT_TICKET_SORT,
      q: "hello"
    })
    expect(byQ.items.map((row) => row.ticket.title)).toEqual(["hello world"])

    const mine = yield* queries.list({
      sort: DEFAULT_TICKET_SORT,
      assignee: ["mine"]
    })
    expect(mine.items.map((row) => row.ticket.title)).toEqual(["hello world"])
  }).pipe(Effect.provide(layer))
})

it.effect("count returns zeros for every status on empty project", () => {
  const { layer } = makeTicketsFixture("T", [])
  return Effect.gen(function* () {
    const queries = yield* TicketQueries.TicketQueries
    const result = yield* queries.count({})
    expect(result).toEqual({
      total: 0,
      byStatus: {}
    })
  }).pipe(Effect.provide(layer))
})

it.effect("count aggregates byStatus across a mixed-status project", () => {
  const { documents, layer } = makeTicketsFixture("T", [])
  documents.set(
    "T-1",
    makeTicketDocument("T-1", { status: ticketStatus("todo") })
  )
  documents.set(
    "T-2",
    makeTicketDocument("T-2", { status: ticketStatus("todo") })
  )
  documents.set(
    "T-3",
    makeTicketDocument("T-3", { status: ticketStatus("todo") })
  )
  documents.set(
    "T-4",
    makeTicketDocument("T-4", { status: ticketStatus("in_progress") })
  )
  documents.set(
    "T-5",
    makeTicketDocument("T-5", { status: ticketStatus("in_progress") })
  )
  documents.set(
    "T-6",
    makeTicketDocument("T-6", { status: ticketStatus("done") })
  )

  return Effect.gen(function* () {
    const queries = yield* TicketQueries.TicketQueries
    const result = yield* queries.count({})
    expect(result).toEqual({
      total: 6,
      byStatus: { todo: 3, in_progress: 2, done: 1 }
    })
  }).pipe(Effect.provide(layer))
})

it.effect(
  "count strips status from filter so chip counts stay meaningful",
  () => {
    const { documents, layer } = makeTicketsFixture("T", [])
    documents.set(
      "T-1",
      makeTicketDocument("T-1", { status: ticketStatus("todo") })
    )
    documents.set(
      "T-2",
      makeTicketDocument("T-2", { status: ticketStatus("todo") })
    )
    documents.set(
      "T-3",
      makeTicketDocument("T-3", { status: ticketStatus("todo") })
    )
    documents.set(
      "T-4",
      makeTicketDocument("T-4", { status: ticketStatus("in_progress") })
    )
    documents.set(
      "T-5",
      makeTicketDocument("T-5", { status: ticketStatus("in_progress") })
    )
    documents.set(
      "T-6",
      makeTicketDocument("T-6", { status: ticketStatus("done") })
    )

    return Effect.gen(function* () {
      const queries = yield* TicketQueries.TicketQueries
      const result = yield* queries.count({
        status: [ticketStatus("done")]
      })
      expect(result).toEqual({
        total: 6,
        byStatus: { todo: 3, in_progress: 2, done: 1 }
      })
    }).pipe(Effect.provide(layer))
  }
)

it.effect("count still applies non-status filters", () => {
  const { documents, layer } = makeTicketsFixture("T", [])
  documents.set(
    "T-1",
    makeTicketDocument("T-1", {
      status: ticketStatus("todo"),
      type: TypeKey.make("feat")
    })
  )
  documents.set(
    "T-2",
    makeTicketDocument("T-2", {
      status: ticketStatus("in_progress"),
      type: TypeKey.make("feat")
    })
  )
  documents.set(
    "T-3",
    makeTicketDocument("T-3", {
      status: ticketStatus("done"),
      type: TypeKey.make("feat")
    })
  )
  documents.set(
    "T-4",
    makeTicketDocument("T-4", {
      status: ticketStatus("todo"),
      type: TypeKey.make("bug")
    })
  )
  documents.set(
    "T-5",
    makeTicketDocument("T-5", {
      status: ticketStatus("in_progress"),
      type: TypeKey.make("bug")
    })
  )

  return Effect.gen(function* () {
    const queries = yield* TicketQueries.TicketQueries
    const result = yield* queries.count({
      type: [TypeKey.make("bug")]
    })
    expect(result).toEqual({
      total: 2,
      byStatus: { todo: 1, in_progress: 1 }
    })
  }).pipe(Effect.provide(layer))
})

it.effect("count substitutes mine to viewerId like list", () => {
  const { documents, layer } = makeTicketsFixture("T", [])
  documents.set(
    "T-1",
    makeTicketDocument("T-1", {
      status: ticketStatus("todo"),
      assignees: ["user-1"]
    })
  )
  documents.set(
    "T-2",
    makeTicketDocument("T-2", {
      status: ticketStatus("in_progress"),
      assignees: ["user-1"]
    })
  )
  documents.set(
    "T-3",
    makeTicketDocument("T-3", {
      status: ticketStatus("done"),
      assignees: ["user-2"]
    })
  )

  return Effect.gen(function* () {
    const queries = yield* TicketQueries.TicketQueries
    const result = yield* queries.count({
      assignee: ["mine"]
    })
    expect(result).toEqual({
      total: 2,
      byStatus: { todo: 1, in_progress: 1 }
    })
  }).pipe(Effect.provide(layer))
})

for (const scenario of [
  { branch: null, pr: null, tag: "no_branch", indexReads: 1 },
  { branch: "feat/T-1", pr: 80, tag: "pr_pending", indexReads: 1 },
  { branch: "feat/T-1", pr: null, tag: "stale_branch", indexReads: 1 }
] as const) {
  it.effect(
    `detail preserves git state with one index lookup for ${scenario.tag}`,
    () => {
      const docs = makeFakeTicketDocs(["T-1"])
      const document = makeTicketDocument("T-1", {
        branch: scenario.branch,
        pr: scenario.pr
      })
      docs.documents.set("T-1", document)
      let projectReads = 0
      let indexReads = 0
      const layer = makeTicketsLayer("T", docs.layer, {
        ticketIndex: makeFakeTicketIndex(docs.documents, {
          projectFor: () =>
            Effect.sync(() => {
              projectReads++
              return ticketIndexProject
            }),
          getBranchDeletedAt: () =>
            Effect.sync(() => {
              indexReads++
              return isoDate("2026-01-02T00:00:00.000Z")
            })
        })
      })
      return Effect.gen(function* () {
        const queries = yield* TicketQueries.TicketQueries
        const detail = yield* queries.get("T-1")
        expect(detail.gitState.tag).toBe(scenario.tag)
        expect(projectReads).toBe(0)
        expect(indexReads).toBe(scenario.indexReads)
      }).pipe(Effect.provide(layer))
    }
  )
}

it.effect("hides GitHub state from anyone without github:read", () => {
  const { layer } = permissionFixture()
  return Effect.gen(function* () {
    const queries = yield* TicketQueries.TicketQueries
    const developerView = yield* queries
      .get("T-1")
      .pipe(as(scopeAs("member", "developer", "user-1")))
    const clientView = yield* queries
      .get("T-1")
      .pipe(as(scopeAs("guest", "client", "client-1")))
    expect(developerView.branch).toBe("feat/T-1")
    expect(clientView).toMatchObject({
      branch: null,
      pr: null,
      prState: null,
      lastTransitionedPr: null,
      gitState: { tag: "no_branch" }
    })
  }).pipe(Effect.provide(layer))
})

it.effect("refuses GitHub filters to anyone without github:read", () => {
  const { layer } = permissionFixture()
  const client = as(scopeAs("guest", "client", "client-1"))
  return Effect.gen(function* () {
    const queries = yield* TicketQueries.TicketQueries
    const withBranch = yield* queries
      .list({ sort: DEFAULT_TICKET_SORT, hasBranch: true })
      .pipe(as(scopeAs("member", "developer", "user-1")))
    expect(withBranch.items.map(({ ticket }) => ticket.id)).toEqual(["T-1"])
    const refused = [
      yield* Effect.flip(
        queries
          .list({ sort: DEFAULT_TICKET_SORT, hasBranch: true })
          .pipe(client)
      ),
      yield* Effect.flip(queries.count({ hasPr: false }).pipe(client))
    ]
    expect(refused.map((error) => error._tag)).toStrictEqual([
      "Forbidden",
      "Forbidden"
    ])
    const unfiltered = yield* queries
      .list({ sort: DEFAULT_TICKET_SORT })
      .pipe(client)
    expect(unfiltered.items).toHaveLength(2)
  }).pipe(Effect.provide(layer))
})
