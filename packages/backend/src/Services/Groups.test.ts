import { it } from "@effect/vitest"
import { Effect, Layer, Schema } from "effect"
import { expect } from "vitest"
import { Forbidden, NotFound, TicketId } from "@projectproject/shared"
import type { ProjectDetail, Role } from "@projectproject/shared"
import { Groups } from "./Groups"
import { GroupsLive } from "../Layers/Groups"
import { GroupIdTaken, Markdown, type MarkdownShape } from "./Markdown"
import { Projects, type ProjectsShape } from "./Projects"

type FileEntry = { fm: Record<string, unknown>; body: string }
const ticketId = Schema.decodeUnknownSync(TicketId)

function unexpectedMarkdownCall(method: string): Effect.Effect<never> {
  return Effect.die(new Error(`unexpected Markdown.${method} call`))
}

function makeFakeMarkdown(initial?: {
  ticketIds?: ReadonlyArray<string>
  groups?: Record<string, FileEntry>
}) {
  const groups = new Map<string, FileEntry>(
    Object.entries(initial?.groups ?? {})
  )
  const ticketIds = [...(initial?.ticketIds ?? [])]

  const service = {
    root: "/tmp/projectproject-test",
    projectDir: (orgSlug: string, slug: string) =>
      `/tmp/projectproject-test/orgs/${orgSlug}/projects/${slug}`,
    readProjectFile: () => unexpectedMarkdownCall("readProjectFile"),
    writeProjectFile: () => unexpectedMarkdownCall("writeProjectFile"),
    removeProjectDir: () => unexpectedMarkdownCall("removeProjectDir"),
    readTicketFile: () => unexpectedMarkdownCall("readTicketFile"),
    createTicketFile: () => unexpectedMarkdownCall("createTicketFile"),
    writeTicketFile: () => unexpectedMarkdownCall("writeTicketFile"),
    removeTicketFile: () => unexpectedMarkdownCall("removeTicketFile"),
    listTicketIds: () => Effect.succeed([...ticketIds]),
    readGroupFile: (_org: string, _slug: string, id: string) => {
      const g = groups.get(id)
      return g
        ? Effect.succeed({ data: g.fm, body: g.body })
        : Effect.fail(new NotFound())
    },
    createGroupFile: (
      _org: string,
      _slug: string,
      id: string,
      fm: Record<string, unknown>,
      body: string
    ) => {
      if (groups.has(id)) {
        return Effect.fail(new GroupIdTaken())
      }
      groups.set(id, { fm, body })
      return Effect.void
    },
    writeGroupFile: (
      _org: string,
      _slug: string,
      id: string,
      fm: Record<string, unknown>,
      body: string
    ) => {
      groups.set(id, { fm, body })
      return Effect.void
    },
    writeGroupFileIfExists: (
      _org: string,
      _slug: string,
      id: string,
      fm: Record<string, unknown>,
      body: string
    ) => {
      if (!groups.has(id)) return Effect.fail(new NotFound())
      groups.set(id, { fm, body })
      return Effect.void
    },
    removeGroupFile: (_org: string, _slug: string, id: string) => {
      if (!groups.has(id)) return Effect.fail(new NotFound())
      groups.delete(id)
      return Effect.void
    },
    listGroupIds: () => Effect.succeed([...groups.keys()])
  } satisfies MarkdownShape

  return {
    state: { groups, ticketIds },
    layer: Layer.succeed(Markdown, service)
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
  }).pipe(
    Effect.provide(
      GroupsLive.pipe(
        Layer.provide(makeFakeMarkdown().layer),
        Layer.provide(makeFakeProjects({ role: "member" }))
      )
    )
  )
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
  }).pipe(
    Effect.provide(
      GroupsLive.pipe(
        Layer.provide(makeFakeMarkdown().layer),
        Layer.provide(makeFakeProjects({ role: "member" }))
      )
    )
  )
)

it.effect("create with kind=sprint succeeds for admin", () =>
  Effect.gen(function* () {
    const groups = yield* Groups
    const created = yield* groups.create("org", "user-1", "p", {
      name: "Sprint 1",
      kind: "sprint"
    })
    expect(created.kind).toBe("sprint")
  }).pipe(
    Effect.provide(
      GroupsLive.pipe(
        Layer.provide(makeFakeMarkdown().layer),
        Layer.provide(makeFakeProjects({ role: "admin" }))
      )
    )
  )
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
    Effect.provide(
      GroupsLive.pipe(
        Layer.provide(makeFakeMarkdown({ ticketIds: ["T-1"] }).layer),
        Layer.provide(makeFakeProjects({ role: "member" }))
      )
    )
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
    Effect.provide(
      GroupsLive.pipe(
        Layer.provide(makeFakeMarkdown({ ticketIds: ["T-1"] }).layer),
        Layer.provide(makeFakeProjects({ role: "member" }))
      )
    )
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
  }).pipe(
    Effect.provide(
      GroupsLive.pipe(
        Layer.provide(makeFakeMarkdown().layer),
        Layer.provide(makeFakeProjects({ role: "member" }))
      )
    )
  )
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
  }).pipe(
    Effect.provide(
      GroupsLive.pipe(
        Layer.provide(makeFakeMarkdown().layer),
        Layer.provide(makeFakeProjects({ role: "member" }))
      )
    )
  )
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
  }).pipe(
    Effect.provide(
      GroupsLive.pipe(
        Layer.provide(makeFakeMarkdown().layer),
        Layer.provide(makeFakeProjects({ role: "member" }))
      )
    )
  )
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
  }).pipe(
    Effect.provide(
      GroupsLive.pipe(
        Layer.provide(makeFakeMarkdown().layer),
        Layer.provide(makeFakeProjects({ role: "member" }))
      )
    )
  )
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
      GroupsLive.pipe(
        Layer.provide(makeFakeMarkdown({ ticketIds: ["T-1", "T-2"] }).layer),
        Layer.provide(makeFakeProjects({ role: "member" }))
      )
    )
  )
)
