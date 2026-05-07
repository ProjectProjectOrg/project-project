import { it } from "@effect/vitest"
import { Effect, Layer } from "effect"
import { expect } from "vitest"
import { Forbidden, NotFound } from "@projectproject/shared"
import { Groups } from "./Groups"
import { Markdown } from "./Markdown"
import { Projects } from "./Projects"

type FileEntry = { fm: Record<string, unknown>; body: string }

function makeFakeMarkdown(initial?: {
  ticketIds?: ReadonlyArray<string>
  groups?: Record<string, FileEntry>
}) {
  const groups = new Map<string, FileEntry>(
    Object.entries(initial?.groups ?? {})
  )
  const ticketIds = [...(initial?.ticketIds ?? [])]

  return {
    state: { groups, ticketIds },
    layer: Layer.succeed(Markdown, {
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
          return Effect.fail({ _tag: "GroupIdTaken" } as never)
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
      removeGroupFile: (_org: string, _slug: string, id: string) => {
        if (!groups.has(id)) return Effect.fail(new NotFound())
        groups.delete(id)
        return Effect.void
      },
      listGroupIds: (_org: string, _slug: string) =>
        Effect.succeed([...groups.keys()]),
      listTicketIds: (_org: string, _slug: string) =>
        Effect.succeed([...ticketIds])
    } as never)
  }
}

function makeFakeProjects(opts: { role?: "owner" | "admin" | "member" } = {}) {
  const role = opts.role ?? "member"
  return Layer.succeed(Projects, {
    requireMember: () => Effect.succeed({ role }),
    requireRole: (
      _org: string,
      _userId: string,
      _slug: string,
      allowed: ReadonlyArray<"owner" | "admin" | "member">
    ) =>
      allowed.includes(role)
        ? Effect.succeed({ role })
        : Effect.fail(new Forbidden())
  } as never)
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
      Groups.Default.pipe(
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
      Groups.Default.pipe(
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
      Groups.Default.pipe(
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
        tickets: ["T-99" as never]
      })
    )
    expect(result._tag).toBe("Left")
    if (result._tag === "Left") {
      expect(result.left._tag).toBe("Conflict")
    }
  }).pipe(
    Effect.provide(
      Groups.Default.pipe(
        Layer.provide(makeFakeMarkdown({ ticketIds: ["T-1"] }).layer),
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
      tickets: ["T-1" as never, "T-2" as never]
    })
    yield* groups.removeTicketFromAllGroups("org", "p", "T-1")
    const after = yield* groups.get("org", "user-1", "p", created.id)
    expect(after.tickets).toEqual(["T-2"])
  }).pipe(
    Effect.provide(
      Groups.Default.pipe(
        Layer.provide(makeFakeMarkdown({ ticketIds: ["T-1", "T-2"] }).layer),
        Layer.provide(makeFakeProjects({ role: "member" }))
      )
    )
  )
)
