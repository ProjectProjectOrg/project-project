import { it } from "@effect/vitest"
import * as DateTime from "effect/DateTime"
import * as Effect from "effect/Effect"
import * as Layer from "effect/Layer"
import * as Schema from "effect/Schema"
import { expect } from "vitest"

const isoDate = (s: string) => DateTime.toDate(DateTime.unsafeMake(s))
import { Forbidden, GroupId, NotFound, TicketId } from "@projectproject/shared"
import type { GroupDetail, ProjectDetail, Role } from "@projectproject/shared"
import { GroupDocs, type GroupDocsShape, type GroupDocument } from "./GroupDocs"
import { Groups } from "./Groups"
import { GroupsLive } from "../Layers/Groups"
import { GroupIdTaken } from "./Markdown"
import { Projects, type ProjectsShape } from "./Projects"
import { TicketDocs, type TicketDocsShape } from "./TicketDocs"

const groupId = Schema.decodeUnknownSync(GroupId)
const ticketId = Schema.decodeUnknownSync(TicketId)

function unexpectedTicketDocsCall(method: string): Effect.Effect<never> {
  return Effect.die(new Error(`unexpected TicketDocs.${method} call`))
}

function makeFakeDocs(initial?: {
  ticketIds?: ReadonlyArray<string>
  groups?: Record<string, GroupDetail>
}) {
  const groups = new Map<string, GroupDocument>(
    Object.entries(initial?.groups ?? {})
  )
  const ticketIds = [...(initial?.ticketIds ?? [])]

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
    read: () => unexpectedTicketDocsCall("read"),
    create: () => unexpectedTicketDocsCall("create"),
    write: () => unexpectedTicketDocsCall("write"),
    remove: () => unexpectedTicketDocsCall("remove")
  } satisfies TicketDocsShape

  return {
    state: { groups, ticketIds },
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
    createdAt: isoDate("2026-01-01T00:00:00.000Z"),
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
        startsAt: isoDate("2026-06-01"),
        endsAt: isoDate("2026-05-01")
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
      startsAt: isoDate("2026-06-01"),
      endsAt: isoDate("2026-07-01")
    })
    const result = yield* Effect.either(
      groups.update("org", "user-1", "p", created.id, {
        endsAt: isoDate("2026-05-15")
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
    const future = DateTime.toDate(
      DateTime.add(DateTime.unsafeNow(), { days: 1 })
    )
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
      startsAt: isoDate("2026-04-01"),
      endsAt: isoDate("2026-04-30")
    })
    const result = yield* Effect.either(
      groups.update("org", "user-1", "p", created.id, {
        completedAt: isoDate("2026-03-01")
      })
    )
    expect(result._tag).toBe("Left")
    if (result._tag === "Left") {
      expect(result.left._tag).toBe("Validation")
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
