import { it } from "@effect/vitest"
import {
  DEFAULT_TICKET_SORT,
  NotFound,
  GroupDetail,
  GroupId,
  TICKET_LIST_LIMIT,
  type TicketListQuery
} from "@pp/shared"
import * as DateTime from "effect/DateTime"
import * as Effect from "effect/Effect"
import * as Layer from "effect/Layer"
import * as Schema from "effect/Schema"
import { expect } from "vitest"

import {} from "../github/GitHub"
import { Groups, type GroupsShape } from "../groups/Groups"
import {
  decodeGroupSync,
  isoDate,
  ticketId,
  ticketStatus,
  groupId,
  groupColor,
  githubIntegration,
  ticketIndexProject,
  unexpected,
  makeTicketDocument,
  makeFakeTicketDocs,
  makeFakeProjects,
  makeFakeGroups,
  makeFakeTicketIndex,
  makeTicketsLayer,
  makeTicketsFixture,
  scopeAs,
  permissionFixture,
  as
} from "./testing"
import * as TicketCommands from "./TicketCommands"
import { type TicketDocument } from "./TicketDocs"
import * as TicketQueries from "./TicketQueries"

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
    projects: makeFakeProjects("T", {
      githubIntegration: () => Effect.succeed(githubIntegration)
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

it.effect("epicSections groups tickets under their epic, then No epic", () => {
  const docs = makeFakeTicketDocs([])
  const add = (id: string, overrides: Partial<TicketDocument>) =>
    docs.documents.set(id, makeTicketDocument(id, overrides))
  add("T-1", { type: "epic", title: "Estimation" })
  add("T-2", { title: "Estimate field", parent: ticketId("T-1") })
  add("T-3", { title: "Passkeys" })
  add("T-4", { type: "epic", title: "Access control" })
  const layer = makeTicketsLayer("T", docs.layer, {
    ticketIndex: makeFakeTicketIndex(docs.documents)
  })
  return Effect.gen(function* () {
    const queries = yield* TicketQueries.TicketQueries
    const result = yield* queries.epicSections({
      sort: DEFAULT_TICKET_SORT
    })

    expect(
      result.sections.map((section) => ({
        key: section.key,
        title: section.title,
        ids: section.page.items.map((row) => row.ticket.id)
      }))
    ).toEqual([
      { key: "T-4", title: "Access control", ids: [] },
      { key: "T-1", title: "Estimation", ids: ["T-2"] },
      { key: "none", title: null, ids: ["T-3"] }
    ])
    expect(result.total).toBe(2)
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

it.effect("list defaults to created desc", () => {
  const { documents, layer } = makeTicketsFixture("T", [])
  documents.set(
    "T-1",
    makeTicketDocument("T-1", {
      title: "old",
      createdAt: isoDate("2026-01-01T00:00:00.000Z")
    })
  )
  documents.set(
    "T-2",
    makeTicketDocument("T-2", {
      title: "mid",
      createdAt: isoDate("2026-02-01T00:00:00.000Z")
    })
  )
  documents.set(
    "T-3",
    makeTicketDocument("T-3", {
      title: "new",
      createdAt: isoDate("2026-03-01T00:00:00.000Z")
    })
  )

  return Effect.gen(function* () {
    const queries = yield* TicketQueries.TicketQueries
    const result = yield* queries.list({
      sort: DEFAULT_TICKET_SORT
    })

    expect(result.items.map((row) => row.ticket.title)).toEqual([
      "new",
      "mid",
      "old"
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

it.effect("list paginates by cursor with default created desc sort", () => {
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

  return Effect.gen(function* () {
    const queries = yield* TicketQueries.TicketQueries
    const page1 = yield* queries.list({
      sort: DEFAULT_TICKET_SORT
    })
    expect(page1.items.length).toBe(TICKET_LIST_LIMIT)
    expect(page1.nextCursor).not.toBeNull()
    const page1Times = page1.items.map((row) => row.ticket.createdAt.getTime())
    for (let i = 1; i < page1Times.length; i++) {
      expect(page1Times[i - 1]).toBeGreaterThan(page1Times[i])
    }

    const page2 = yield* queries.list({
      sort: DEFAULT_TICKET_SORT,
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
    makeTicketDocument("T-1", { status: ticketStatus("todo"), type: "feat" })
  )
  documents.set(
    "T-2",
    makeTicketDocument("T-2", {
      status: ticketStatus("in_progress"),
      type: "feat"
    })
  )
  documents.set(
    "T-3",
    makeTicketDocument("T-3", { status: ticketStatus("done"), type: "feat" })
  )
  documents.set(
    "T-4",
    makeTicketDocument("T-4", { status: ticketStatus("todo"), type: "bug" })
  )
  documents.set(
    "T-5",
    makeTicketDocument("T-5", {
      status: ticketStatus("in_progress"),
      type: "bug"
    })
  )

  return Effect.gen(function* () {
    const queries = yield* TicketQueries.TicketQueries
    const result = yield* queries.count({
      type: ["bug"]
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

it.effect(
  "sections returns matching counts and independently paginated status pages",
  () => {
    const { documents, layer } = makeTicketsFixture("T", [])
    for (let index = 1; index <= 52; index++) {
      documents.set(
        `T-${index}`,
        makeTicketDocument(`T-${index}`, {
          title: `needle ${index}`,
          status: ticketStatus("todo")
        })
      )
    }
    documents.set(
      "T-53",
      makeTicketDocument("T-53", {
        title: "needle in progress",
        status: ticketStatus("in_progress")
      })
    )
    documents.set(
      "T-54",
      makeTicketDocument("T-54", {
        title: "unrelated",
        status: ticketStatus("done")
      })
    )
    return Effect.gen(function* () {
      const queries = yield* TicketQueries.TicketQueries
      const query = { q: "needle", sort: { key: "id", dir: "asc" } } as const
      const snapshot = yield* queries.sections(query)
      expect(snapshot.counts).toEqual({
        total: 53,
        byStatus: { todo: 52, in_progress: 1 }
      })
      const todo = snapshot.sections[ticketStatus("todo")]
      expect(todo.items).toHaveLength(50)
      expect(todo.nextCursor).not.toBeNull()
      expect(
        snapshot.sections[ticketStatus("in_progress")].items.map(
          ({ ticket }) => ticket.id
        )
      ).toEqual(["T-53"])
      const next = yield* queries.list({
        ...query,
        status: [ticketStatus("todo")],
        cursor: todo.nextCursor ?? undefined
      })
      expect(next.items.map(({ ticket }) => ticket.id)).toEqual([
        "T-51",
        "T-52"
      ])
      expect(next.nextCursor).toBeNull()
      const selected = yield* queries.sections({
        ...query,
        status: [ticketStatus("in_progress")]
      })
      expect(Object.keys(selected.sections)).toEqual(["in_progress"])
      expect(selected.counts).toEqual(snapshot.counts)
    }).pipe(Effect.provide(layer))
  }
)

function sprintGroup(
  id: string,
  tickets: ReadonlyArray<string>,
  completedAt: Date | null = null
): GroupDetail {
  return {
    id: groupId(id),
    name: id,
    kind: "sprint",
    tickets: tickets.map((id) => ticketId(id)),
    color: groupColor("#94a3b8"),
    startsAt: null,
    endsAt: null,
    completedAt,
    createdBy: "user-1",
    createdAt: isoDate("2026-01-01T00:00:00.000Z"),
    updatedAt: isoDate("2026-01-01T00:00:00.000Z"),
    body: ""
  }
}

function makeFakeSprintGroups(sprints: ReadonlyArray<GroupDetail>) {
  const byId = new Map(sprints.map((sprint) => [sprint.id, sprint]))
  const isGroupId = Schema.is(GroupId)
  return Layer.succeed(Groups, {
    list: () => Effect.succeed(sprints),
    listPaged: () => unexpected("Groups.listPaged"),
    listSprintsPaged: () => unexpected("Groups.listSprintsPaged"),
    get: (id) => {
      if (!isGroupId(id)) return Effect.fail(new NotFound())
      const sprint = byId.get(id)
      return sprint === undefined
        ? Effect.fail(new NotFound())
        : Effect.succeed(sprint)
    },
    create: () => unexpected("Groups.create"),
    update: () => unexpected("Groups.update"),
    updateTickets: () => unexpected("Groups.updateTickets"),
    addTickets: () => unexpected("Groups.addTickets"),
    removeTickets: () => unexpected("Groups.removeTickets"),
    updateTicketOrder: () => unexpected("Groups.updateTicketOrder"),
    complete: () => unexpected("Groups.complete"),
    remove: () => unexpected("Groups.remove"),
    ensureSprintAssignable: () => Effect.void,
    setSprintMembership: () => Effect.void,
    removeTicketFromAllGroups: () => Effect.void
  } satisfies GroupsShape)
}

it.effect(
  "sprintSections returns matching counts and independently paginated sprint pages",
  () => {
    const docs = makeFakeTicketDocs([])
    const { documents } = docs
    for (let index = 1; index <= 52; index++) {
      documents.set(
        `T-${index}`,
        makeTicketDocument(`T-${index}`, { title: `sprint ${index}` })
      )
    }
    documents.set(
      "T-53",
      makeTicketDocument("T-53", { title: "unscheduled leftover" })
    )
    const sprintIds = Array.from({ length: 52 }, (_, index) => `T-${index + 1}`)
    const g1 = sprintGroup("G-1", sprintIds)
    const g2 = sprintGroup("G-2", [])
    const layer = makeTicketsLayer("T", docs.layer, {
      ticketIndex: makeFakeTicketIndex(documents),
      groups: makeFakeSprintGroups([g1, g2])
    })
    return Effect.gen(function* () {
      const queries = yield* TicketQueries.TicketQueries
      const query = { sort: { key: "id", dir: "asc" } } as const
      const snapshot = yield* queries.sprintSections(query)
      expect(snapshot.total).toBe(53)
      const g1Section = snapshot.sections.find(
        (section) => section.key === g1.id
      )
      const g2Section = snapshot.sections.find(
        (section) => section.key === g2.id
      )
      const unscheduled = snapshot.sections.find(
        (section) => section.key === "unscheduled"
      )
      expect(g1Section?.count).toBe(52)
      expect(g1Section?.page.items).toHaveLength(50)
      expect(g1Section?.page.nextCursor).not.toBeNull()
      expect(g2Section?.page.items).toEqual([])
      expect(unscheduled?.page.items.map(({ ticket }) => ticket.id)).toEqual([
        "T-53"
      ])
      const next = yield* queries.list({
        ...query,
        groupId: [g1.id],
        cursor: g1Section?.page.nextCursor ?? undefined
      })
      expect(next.items.map(({ ticket }) => ticket.id)).toEqual([
        "T-51",
        "T-52"
      ])
      expect(next.nextCursor).toBeNull()
      const selected = yield* queries.sprintSections({
        ...query,
        groupId: [g2.id]
      })
      expect(selected.sections.map((section) => section.key)).toEqual([g2.id])
      expect(selected.total).toBe(0)
    }).pipe(Effect.provide(layer))
  }
)

it.effect(
  "sprintSections counts the selected sections across every status",
  () => {
    const docs = makeFakeTicketDocs([])
    const { documents } = docs
    documents.set("T-1", makeTicketDocument("T-1"))
    documents.set(
      "T-2",
      makeTicketDocument("T-2", { status: ticketStatus("review") })
    )
    documents.set(
      "T-3",
      makeTicketDocument("T-3", { status: ticketStatus("review") })
    )
    documents.set("T-4", makeTicketDocument("T-4"))
    const g1 = sprintGroup("G-1", ["T-1", "T-2"])
    const g2 = sprintGroup("G-2", ["T-3"])
    const layer = makeTicketsLayer("T", docs.layer, {
      ticketIndex: makeFakeTicketIndex(documents),
      groups: makeFakeSprintGroups([g1, g2])
    })
    return Effect.gen(function* () {
      const queries = yield* TicketQueries.TicketQueries
      const query = {
        sort: { key: "id", dir: "asc" },
        status: [ticketStatus("review")]
      } as const
      const all = yield* queries.sprintSections(query)
      expect(all.total).toBe(2)
      expect(all.counts).toEqual({
        total: 4,
        byStatus: { todo: 2, review: 2 }
      })
      const selected = yield* queries.sprintSections({
        ...query,
        groupId: [g1.id]
      })
      expect(
        selected.sections.map(({ key, count }) => ({ key, count }))
      ).toEqual([{ key: g1.id, count: 1 }])
      expect(selected.counts).toEqual({
        total: 2,
        byStatus: { todo: 1, review: 1 }
      })
      const repeated = yield* queries.sprintSections({
        ...query,
        status: [ticketStatus("review"), ticketStatus("review")],
        groupId: [g1.id, g1.id]
      })
      expect(repeated.total).toBe(1)
      expect(repeated.sections).toHaveLength(1)
      expect(repeated.sections[0]?.count).toBe(1)
      expect(repeated.counts).toEqual(selected.counts)
    }).pipe(Effect.provide(layer))
  }
)

it.effect("sprintSections assigns each ticket to one section", () => {
  const docs = makeFakeTicketDocs([])
  const { documents } = docs
  documents.set("T-1", makeTicketDocument("T-1", { title: "done leftover" }))
  documents.set("T-2", makeTicketDocument("T-2", { title: "still active" }))
  documents.set("T-3", makeTicketDocument("T-3", { title: "unscheduled" }))
  const done = sprintGroup(
    "G-1",
    ["T-1", "T-2"],
    isoDate("2026-04-01T00:00:00.000Z")
  )
  const active = sprintGroup("G-2", ["T-2"])
  const layer = makeTicketsLayer("T", docs.layer, {
    ticketIndex: makeFakeTicketIndex(documents),
    groups: makeFakeSprintGroups([done, active])
  })
  return Effect.gen(function* () {
    const queries = yield* TicketQueries.TicketQueries
    const snapshot = yield* queries.sprintSections({
      sort: { key: "id", dir: "asc" }
    })
    const doneSection = snapshot.sections.find(
      (section) => section.key === done.id
    )
    const activeSection = snapshot.sections.find(
      (section) => section.key === active.id
    )
    const unscheduled = snapshot.sections.find(
      (section) => section.key === "unscheduled"
    )
    expect(doneSection?.page.items.map(({ ticket }) => ticket.id)).toEqual([
      "T-1"
    ])
    expect(activeSection?.page.items.map(({ ticket }) => ticket.id)).toEqual([
      "T-2"
    ])
    expect(unscheduled?.page.items.map(({ ticket }) => ticket.id)).toEqual([
      "T-3"
    ])
    expect(snapshot.total).toBe(3)

    const ungroupedQuery = {
      sort: { key: "id", dir: "asc" },
      groupId: ["ungrouped"]
    } as const
    const ungroupedList = yield* queries.list(ungroupedQuery)
    const ungroupedSections = yield* queries.sprintSections(ungroupedQuery)
    expect(ungroupedSections.sections).toHaveLength(1)
    expect(
      ungroupedSections.sections[0]?.page.items.map(({ ticket }) => ticket.id)
    ).toEqual(ungroupedList.items.map(({ ticket }) => ticket.id))
    expect(ungroupedSections.counts.total).toBe(2)

    const completedOnly = yield* queries.sprintSections({
      ...ungroupedQuery,
      groupId: [done.id]
    })
    expect(
      completedOnly.sections[0]?.page.items.map(({ ticket }) => ticket.id)
    ).toEqual(["T-1", "T-2"])

    const both = yield* queries.sprintSections({
      ...ungroupedQuery,
      groupId: ["ungrouped", done.id]
    })
    expect(both.counts.total).toBe(3)
    expect(
      both.sections.flatMap((section) =>
        section.page.items.map(({ ticket }) => ticket.id)
      )
    ).toEqual(["T-3", "T-1", "T-2"])
  }).pipe(Effect.provide(layer))
})

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
      yield* Effect.flip(queries.count({ hasPr: false }).pipe(client)),
      yield* Effect.flip(
        queries
          .sections({ sort: DEFAULT_TICKET_SORT, hasPr: true })
          .pipe(client)
      ),
      yield* Effect.flip(
        queries
          .sprintSections({ sort: DEFAULT_TICKET_SORT, hasBranch: false })
          .pipe(client)
      )
    ]
    expect(refused.map((error) => error._tag)).toStrictEqual([
      "Forbidden",
      "Forbidden",
      "Forbidden",
      "Forbidden"
    ])
    const unfiltered = yield* queries
      .list({ sort: DEFAULT_TICKET_SORT })
      .pipe(client)
    expect(unfiltered.items).toHaveLength(2)
  }).pipe(Effect.provide(layer))
})
