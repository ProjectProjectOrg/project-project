import { it } from "@effect/vitest"
import { Effect, Layer, Schema } from "effect"
import { expect } from "vitest"
import { Forbidden, GroupId, NotFound, TicketId } from "@projectproject/shared"
import type {
  GroupDetail,
  ProjectDetail,
  Role,
  TicketStatus
} from "@projectproject/shared"
import { GroupDocs, type GroupDocsShape, type GroupDocument } from "./GroupDocs"
import { Groups } from "./Groups"
import { GroupsLive } from "../Layers/Groups"
import { GroupIdTaken } from "./Markdown"
import { Projects, type ProjectsShape } from "./Projects"
import {
  TicketDocs,
  type TicketDocsShape,
  type TicketDocument
} from "./TicketDocs"

const groupId = Schema.decodeUnknownSync(GroupId)
const ticketId = Schema.decodeUnknownSync(TicketId)

function unexpectedTicketDocsCall(method: string): Effect.Effect<never> {
  return Effect.die(new Error(`unexpected TicketDocs.${method} call`))
}

function makeTicketDocument(
  id: string,
  status: TicketStatus = "todo"
): TicketDocument {
  const now = new Date("2026-04-01T00:00:00.000Z")
  return {
    id: ticketId(id),
    title: id,
    status,
    type: "other",
    priority: "p3",
    tags: [],
    branch: null,
    pr: null,
    lastTransitionedPr: null,
    assignees: [],
    createdBy: "user-1",
    createdAt: now,
    updatedAt: now,
    body: ""
  }
}

function makeFakeDocs(initial?: {
  ticketIds?: ReadonlyArray<string>
  ticketStatuses?: Record<string, TicketStatus>
  groups?: Record<string, GroupDetail>
}) {
  const groups = new Map<string, GroupDocument>(
    Object.entries(initial?.groups ?? {})
  )
  const ticketIds = [...(initial?.ticketIds ?? [])]
  const ticketsById = new Map<string, TicketDocument>(
    ticketIds.map((id) => [
      id,
      makeTicketDocument(id, initial?.ticketStatuses?.[id] ?? "todo")
    ])
  )

  const groupService = {
    listIds: () => Effect.succeed([...groups.keys()].map((id) => groupId(id))),
    read: (_org: string, _slug: string, id: string) => {
      const group = groups.get(id)
      return group ? Effect.succeed(group) : Effect.fail(new NotFound())
    },
    create: (_org: string, _slug: string, document: GroupDocument) => {
      if (groups.has(document.id)) {
        return Effect.fail(new GroupIdTaken())
      }
      groups.set(document.id, document)
      return Effect.void
    },
    write: (
      _org: string,
      _slug: string,
      id: string,
      document: GroupDocument
    ) => {
      groups.set(id, document)
      return Effect.void
    },
    writeIfExists: (
      _org: string,
      _slug: string,
      id: string,
      document: GroupDocument
    ) => {
      if (!groups.has(id)) return Effect.fail(new NotFound())
      groups.set(id, document)
      return Effect.void
    },
    remove: (_org: string, _slug: string, id: string) => {
      if (!groups.has(id)) return Effect.fail(new NotFound())
      groups.delete(id)
      return Effect.void
    }
  } satisfies GroupDocsShape

  const ticketService = {
    listIds: () => Effect.succeed(ticketIds.map((id) => ticketId(id))),
    read: (_org: string, _slug: string, id: string) => {
      const ticket = ticketsById.get(id)
      return ticket ? Effect.succeed(ticket) : Effect.fail(new NotFound())
    },
    create: () => unexpectedTicketDocsCall("create"),
    write: () => unexpectedTicketDocsCall("write"),
    remove: () => unexpectedTicketDocsCall("remove")
  } satisfies TicketDocsShape

  return {
    state: { groups, ticketIds, ticketsById },
    groupLayer: Layer.succeed(GroupDocs, groupService),
    ticketLayer: Layer.succeed(TicketDocs, ticketService)
  }
}

function makeProjectDetail(role: Role): ProjectDetail {
  return {
    org: "org",
    slug: "p",
    name: "Project",
    createdBy: "user-1",
    createdAt: new Date("2026-01-01T00:00:00.000Z"),
    github: null,
    body: "# Project\n",
    members: [
      {
        id: "user-1",
        username: null,
        name: "User One",
        email: "user@example.com",
        image: null,
        role
      }
    ]
  }
}

function unexpectedProjectCall(method: string): Effect.Effect<never> {
  return Effect.die(new Error(`unexpected Projects.${method} call`))
}

function makeFakeProjects(opts: { role?: Role } = {}) {
  const role = opts.role ?? "member"
  const service = {
    list: () => Effect.succeed([]),
    create: () => unexpectedProjectCall("create"),
    requireMember: () => Effect.succeed({ role }),
    requireRole: (
      _org: string,
      _userId: string,
      _slug: string,
      allowed: ReadonlyArray<Role>
    ) =>
      allowed.includes(role)
        ? Effect.succeed({ role })
        : Effect.fail(new Forbidden()),
    get: () => Effect.succeed(makeProjectDetail(role)),
    update: () => unexpectedProjectCall("update"),
    remove: () => unexpectedProjectCall("remove"),
    addMember: () => unexpectedProjectCall("addMember"),
    updateMember: () => unexpectedProjectCall("updateMember"),
    removeMember: () => unexpectedProjectCall("removeMember"),
    connectGithub: () => unexpectedProjectCall("connectGithub"),
    disconnectGithub: () => unexpectedProjectCall("disconnectGithub")
  } satisfies ProjectsShape

  return Layer.succeed(Projects, service)
}

function makeGroupsLayer(
  docs?: Parameters<typeof makeFakeDocs>[0],
  projects?: { role?: Role }
) {
  const fakeDocs = makeFakeDocs(docs)
  return GroupsLive.pipe(
    Layer.provide(fakeDocs.groupLayer),
    Layer.provide(fakeDocs.ticketLayer),
    Layer.provide(makeFakeProjects(projects))
  )
}

it.effect("create + list returns the new group", () =>
  Effect.gen(function* () {
    const groups = yield* Groups
    const created = yield* groups.create("org", "user-1", "p", {
      name: "Backlog cleanup"
    })
    expect(created.id).toBe("G-1")
    expect(created.kind).toBe("other")

    const list = yield* groups.list("org", "user-1", "p")
    expect(list).toHaveLength(1)
    expect(list[0].name).toBe("Backlog cleanup")
  }).pipe(Effect.provide(makeGroupsLayer(undefined, { role: "member" })))
)

it.effect("create with kind=sprint fails for non-admin member", () =>
  Effect.gen(function* () {
    const groups = yield* Groups
    const result = yield* Effect.either(
      groups.create("org", "user-1", "p", {
        name: "Sprint 1",
        kind: "sprint"
      })
    )
    expect(result._tag).toBe("Left")
    if (result._tag === "Left") {
      expect(result.left._tag).toBe("Forbidden")
    }
  }).pipe(Effect.provide(makeGroupsLayer(undefined, { role: "member" })))
)

it.effect("create with kind=sprint succeeds for admin", () =>
  Effect.gen(function* () {
    const groups = yield* Groups
    const created = yield* groups.create("org", "user-1", "p", {
      name: "Sprint 1",
      kind: "sprint"
    })
    expect(created.kind).toBe("sprint")
  }).pipe(Effect.provide(makeGroupsLayer(undefined, { role: "admin" })))
)

it.effect("updateTickets rejects unknown ticket ids", () =>
  Effect.gen(function* () {
    const groups = yield* Groups
    const created = yield* groups.create("org", "user-1", "p", {
      name: "G"
    })
    const result = yield* Effect.either(
      groups.updateTickets("org", "user-1", "p", created.id, {
        tickets: [ticketId("T-99")]
      })
    )
    expect(result._tag).toBe("Left")
    if (result._tag === "Left") {
      expect(result.left._tag).toBe("NotFound")
    }
  }).pipe(
    Effect.provide(makeGroupsLayer({ ticketIds: ["T-1"] }, { role: "member" }))
  )
)

it.effect("updateTickets returns NotFound before validating tickets", () =>
  Effect.gen(function* () {
    const groups = yield* Groups
    const result = yield* Effect.either(
      groups.updateTickets("org", "user-1", "p", "G-404", {
        tickets: [ticketId("T-99")]
      })
    )
    expect(result._tag).toBe("Left")
    if (result._tag === "Left") {
      expect(result.left._tag).toBe("NotFound")
    }
  }).pipe(
    Effect.provide(makeGroupsLayer({ ticketIds: ["T-1"] }, { role: "member" }))
  )
)

it.effect("create rejects endsAt before startsAt", () =>
  Effect.gen(function* () {
    const groups = yield* Groups
    const result = yield* Effect.either(
      groups.create("org", "user-1", "p", {
        name: "G",
        startsAt: new Date("2026-06-01"),
        endsAt: new Date("2026-05-01")
      })
    )
    expect(result._tag).toBe("Left")
    if (result._tag === "Left") {
      expect(result.left._tag).toBe("Validation")
    }
  }).pipe(Effect.provide(makeGroupsLayer(undefined, { role: "member" })))
)

it.effect("update rejects endsAt before existing startsAt", () =>
  Effect.gen(function* () {
    const groups = yield* Groups
    const created = yield* groups.create("org", "user-1", "p", {
      name: "G",
      startsAt: new Date("2026-06-01"),
      endsAt: new Date("2026-07-01")
    })
    const result = yield* Effect.either(
      groups.update("org", "user-1", "p", created.id, {
        endsAt: new Date("2026-05-15")
      })
    )
    expect(result._tag).toBe("Left")
    if (result._tag === "Left") {
      expect(result.left._tag).toBe("Validation")
    }
  }).pipe(Effect.provide(makeGroupsLayer(undefined, { role: "member" })))
)

it.effect("update rejects completedAt in the future", () =>
  Effect.gen(function* () {
    const groups = yield* Groups
    const created = yield* groups.create("org", "user-1", "p", { name: "G" })
    const future = new Date(Date.now() + 1000 * 60 * 60 * 24)
    const result = yield* Effect.either(
      groups.update("org", "user-1", "p", created.id, {
        completedAt: future
      })
    )
    expect(result._tag).toBe("Left")
    if (result._tag === "Left") {
      expect(result.left._tag).toBe("Validation")
    }
  }).pipe(Effect.provide(makeGroupsLayer(undefined, { role: "member" })))
)

it.effect("update rejects completedAt before startsAt", () =>
  Effect.gen(function* () {
    const groups = yield* Groups
    const created = yield* groups.create("org", "user-1", "p", {
      name: "G",
      startsAt: new Date("2026-04-01"),
      endsAt: new Date("2026-04-30")
    })
    const result = yield* Effect.either(
      groups.update("org", "user-1", "p", created.id, {
        completedAt: new Date("2026-03-01")
      })
    )
    expect(result._tag).toBe("Left")
    if (result._tag === "Left") {
      expect(result.left._tag).toBe("Validation")
    }
  }).pipe(Effect.provide(makeGroupsLayer(undefined, { role: "member" })))
)

it.effect(
  "updateTickets against a sprint auto-evicts overlapping ids from other non-completed sprints",
  () =>
    Effect.gen(function* () {
      const groups = yield* Groups
      const sprintA = yield* groups.create("org", "user-1", "p", {
        name: "Sprint A",
        kind: "sprint",
        tickets: [ticketId("T-1"), ticketId("T-2")]
      })
      const sprintB = yield* groups.create("org", "user-1", "p", {
        name: "Sprint B",
        kind: "sprint"
      })
      const epic = yield* groups.create("org", "user-1", "p", {
        name: "Epic",
        tickets: [ticketId("T-1")]
      })

      const result = yield* groups.updateTickets(
        "org",
        "user-1",
        "p",
        sprintB.id,
        { tickets: [ticketId("T-1")] }
      )

      expect(result.target.id).toBe(sprintB.id)
      expect(result.target.tickets).toEqual(["T-1"])
      expect(result.evicted).toHaveLength(1)
      expect(result.evicted[0].groupId).toBe(sprintA.id)
      expect(result.evicted[0].ticketIds).toEqual(["T-1"])

      const sprintAAfter = yield* groups.get(
        "org",
        "user-1",
        "p",
        sprintA.id
      )
      expect(sprintAAfter.tickets).toEqual(["T-2"])

      const epicAfter = yield* groups.get("org", "user-1", "p", epic.id)
      expect(epicAfter.tickets).toEqual(["T-1"])
    }).pipe(
      Effect.provide(
        makeGroupsLayer(
          { ticketIds: ["T-1", "T-2"] },
          { role: "admin" }
        )
      )
    )
)

it.effect(
  "updateTickets against a completed sprint fails with SprintCompletedImmutable",
  () =>
    Effect.gen(function* () {
      const groups = yield* Groups
      const sprint = yield* groups.create("org", "user-1", "p", {
        name: "Sprint",
        kind: "sprint",
        startsAt: new Date("2026-04-01"),
        endsAt: new Date("2026-04-15")
      })
      yield* groups.update("org", "user-1", "p", sprint.id, {
        completedAt: new Date("2026-04-15")
      })
      const result = yield* Effect.either(
        groups.updateTickets("org", "user-1", "p", sprint.id, {
          tickets: [ticketId("T-1")]
        })
      )
      expect(result._tag).toBe("Left")
      if (result._tag === "Left") {
        expect(result.left._tag).toBe("SprintCompletedImmutable")
      }
    }).pipe(
      Effect.provide(
        makeGroupsLayer({ ticketIds: ["T-1"] }, { role: "admin" })
      )
    )
)

it.effect(
  "updateTickets against a sprint does not evict from completed sprints",
  () =>
    Effect.gen(function* () {
      const groups = yield* Groups
      const completed = yield* groups.create("org", "user-1", "p", {
        name: "Completed",
        kind: "sprint",
        startsAt: new Date("2026-03-01"),
        endsAt: new Date("2026-03-15"),
        tickets: [ticketId("T-1")]
      })
      yield* groups.update("org", "user-1", "p", completed.id, {
        completedAt: new Date("2026-03-15")
      })
      const active = yield* groups.create("org", "user-1", "p", {
        name: "Active",
        kind: "sprint"
      })

      const result = yield* groups.updateTickets(
        "org",
        "user-1",
        "p",
        active.id,
        { tickets: [ticketId("T-1")] }
      )

      expect(result.evicted).toHaveLength(0)
      const completedAfter = yield* groups.get(
        "org",
        "user-1",
        "p",
        completed.id
      )
      expect(completedAfter.tickets).toEqual(["T-1"])
    }).pipe(
      Effect.provide(
        makeGroupsLayer({ ticketIds: ["T-1"] }, { role: "admin" })
      )
    )
)

it.effect(
  "complete to backlog: 'done' tickets stay, others fall off the source",
  () =>
    Effect.gen(function* () {
      const groups = yield* Groups
      const sprint = yield* groups.create("org", "user-1", "p", {
        name: "Sprint",
        kind: "sprint",
        startsAt: new Date("2026-03-01"),
        endsAt: new Date("2026-03-15"),
        tickets: [ticketId("T-1"), ticketId("T-2"), ticketId("T-3")]
      })

      const result = yield* groups.complete(
        "org",
        "user-1",
        "p",
        sprint.id,
        { destination: { kind: "backlog" } }
      )

      expect(result.completedAt).not.toBeNull()
      expect(result.tickets).toEqual(["T-2"])
    }).pipe(
      Effect.provide(
        makeGroupsLayer(
          {
            ticketIds: ["T-1", "T-2", "T-3"],
            ticketStatuses: { "T-1": "todo", "T-2": "done", "T-3": "in_progress" }
          },
          { role: "admin" }
        )
      )
    )
)

it.effect(
  "complete to sprint: carryover tickets land on the destination, deduped",
  () =>
    Effect.gen(function* () {
      const groups = yield* Groups
      const source = yield* groups.create("org", "user-1", "p", {
        name: "Source",
        kind: "sprint",
        startsAt: new Date("2026-03-01"),
        endsAt: new Date("2026-03-15"),
        tickets: [ticketId("T-1"), ticketId("T-2"), ticketId("T-3")]
      })
      const dest = yield* groups.create("org", "user-1", "p", {
        name: "Dest",
        kind: "sprint",
        startsAt: new Date("2026-03-15"),
        endsAt: new Date("2026-03-29"),
        tickets: [ticketId("T-3"), ticketId("T-4")]
      })

      yield* groups.complete("org", "user-1", "p", source.id, {
        destination: { kind: "sprint", groupId: dest.id }
      })

      const sourceAfter = yield* groups.get("org", "user-1", "p", source.id)
      expect(sourceAfter.tickets).toEqual(["T-2"])
      expect(sourceAfter.completedAt).not.toBeNull()

      const destAfter = yield* groups.get("org", "user-1", "p", dest.id)
      expect(destAfter.tickets).toEqual(["T-3", "T-4", "T-1"])
      expect(destAfter.completedAt).toBeNull()
    }).pipe(
      Effect.provide(
        makeGroupsLayer(
          {
            ticketIds: ["T-1", "T-2", "T-3", "T-4"],
            ticketStatuses: {
              "T-1": "todo",
              "T-2": "done",
              "T-3": "in_progress",
              "T-4": "todo"
            }
          },
          { role: "admin" }
        )
      )
    )
)

it.effect(
  "complete on an already-completed sprint fails with SprintCompletedImmutable",
  () =>
    Effect.gen(function* () {
      const groups = yield* Groups
      const sprint = yield* groups.create("org", "user-1", "p", {
        name: "Sprint",
        kind: "sprint",
        startsAt: new Date("2026-03-01"),
        endsAt: new Date("2026-03-15")
      })
      yield* groups.update("org", "user-1", "p", sprint.id, {
        completedAt: new Date("2026-03-15")
      })

      const result = yield* Effect.either(
        groups.complete("org", "user-1", "p", sprint.id, {
          destination: { kind: "backlog" }
        })
      )

      expect(result._tag).toBe("Left")
      if (result._tag === "Left") {
        expect(result.left._tag).toBe("SprintCompletedImmutable")
      }
    }).pipe(
      Effect.provide(
        makeGroupsLayer({ ticketIds: [] }, { role: "admin" })
      )
    )
)

it.effect(
  "complete fails with SprintCompletedImmutable when destination is already completed",
  () =>
    Effect.gen(function* () {
      const groups = yield* Groups
      const source = yield* groups.create("org", "user-1", "p", {
        name: "Source",
        kind: "sprint",
        startsAt: new Date("2026-03-01"),
        endsAt: new Date("2026-03-15")
      })
      const dest = yield* groups.create("org", "user-1", "p", {
        name: "Dest",
        kind: "sprint",
        startsAt: new Date("2026-03-15"),
        endsAt: new Date("2026-03-29")
      })
      yield* groups.update("org", "user-1", "p", dest.id, {
        completedAt: new Date("2026-03-29")
      })

      const result = yield* Effect.either(
        groups.complete("org", "user-1", "p", source.id, {
          destination: { kind: "sprint", groupId: dest.id }
        })
      )

      expect(result._tag).toBe("Left")
      if (result._tag === "Left") {
        expect(result.left._tag).toBe("SprintCompletedImmutable")
      }
    }).pipe(
      Effect.provide(
        makeGroupsLayer({ ticketIds: [] }, { role: "admin" })
      )
    )
)

it.effect(
  "complete fails with Validation when source is not a sprint",
  () =>
    Effect.gen(function* () {
      const groups = yield* Groups
      const epic = yield* groups.create("org", "user-1", "p", {
        name: "Epic",
        kind: "epic"
      })

      const result = yield* Effect.either(
        groups.complete("org", "user-1", "p", epic.id, {
          destination: { kind: "backlog" }
        })
      )

      expect(result._tag).toBe("Left")
      if (result._tag === "Left") {
        expect(result.left._tag).toBe("Validation")
      }
    }).pipe(
      Effect.provide(makeGroupsLayer(undefined, { role: "admin" }))
    )
)

it.effect(
  "complete fails with Validation when destination is not a sprint",
  () =>
    Effect.gen(function* () {
      const groups = yield* Groups
      const source = yield* groups.create("org", "user-1", "p", {
        name: "Source",
        kind: "sprint",
        startsAt: new Date("2026-03-01"),
        endsAt: new Date("2026-03-15")
      })
      const epic = yield* groups.create("org", "user-1", "p", {
        name: "Epic",
        kind: "epic"
      })

      const result = yield* Effect.either(
        groups.complete("org", "user-1", "p", source.id, {
          destination: { kind: "sprint", groupId: epic.id }
        })
      )

      expect(result._tag).toBe("Left")
      if (result._tag === "Left") {
        expect(result.left._tag).toBe("Validation")
      }
    }).pipe(
      Effect.provide(makeGroupsLayer(undefined, { role: "admin" }))
    )
)

it.effect("complete fails for non-admin members", () =>
  Effect.gen(function* () {
    const groups = yield* Groups
    const result = yield* Effect.either(
      groups.complete("org", "user-1", "p", "G-1", {
        destination: { kind: "backlog" }
      })
    )

    expect(result._tag).toBe("Left")
    if (result._tag === "Left") {
      expect(["Forbidden", "NotFound"]).toContain(result.left._tag)
    }
  }).pipe(Effect.provide(makeGroupsLayer(undefined, { role: "member" })))
)

it.effect("removeTicketFromAllGroups strips the id", () =>
  Effect.gen(function* () {
    const groups = yield* Groups
    const created = yield* groups.create("org", "user-1", "p", {
      name: "G",
      tickets: [ticketId("T-1"), ticketId("T-2")]
    })
    yield* groups.removeTicketFromAllGroups("org", "p", "T-1")
    const after = yield* groups.get("org", "user-1", "p", created.id)
    expect(after.tickets).toEqual(["T-2"])
  }).pipe(
    Effect.provide(
      makeGroupsLayer({ ticketIds: ["T-1", "T-2"] }, { role: "member" })
    )
  )
)
