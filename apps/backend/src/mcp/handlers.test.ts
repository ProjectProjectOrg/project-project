import { describe, expect, it } from "@effect/vitest"
import {
  CallToolRequestSchema,
  type CallToolRequest
} from "@modelcontextprotocol/sdk/types.js"
import * as AttachmentUploads from "@pp/server-core/attachments/AttachmentUploads"
import { BetterAuth } from "@pp/server-core/auth/BetterAuth"
import { Comments, type CommentsShape } from "@pp/server-core/comments/Comments"
import {
  GroupDocs,
  type GroupDocsShape
} from "@pp/server-core/groups/GroupDocs"
import { Groups } from "@pp/server-core/groups/Groups"
import {
  ProjectDocs,
  type ProjectDocsShape
} from "@pp/server-core/projects/ProjectDocs"
import { Projects, type ProjectsShape } from "@pp/server-core/projects/Projects"
import {
  ProjectStatuses,
  type ProjectStatusesShape
} from "@pp/server-core/projects/ProjectStatuses"
import * as OrgStorage from "@pp/server-core/storage/OrgStorage"
import { Tags } from "@pp/server-core/tags/Tags"
import {
  TicketDocs,
  type TicketDocsShape
} from "@pp/server-core/tickets/TicketDocs"
import {
  TicketIndex,
  type TicketIndexProject,
  type TicketIndexShape
} from "@pp/server-core/tickets/TicketIndex"
import { Tickets, type TicketsShape } from "@pp/server-core/tickets/Tickets"
import { Users } from "@pp/server-core/users/Users"
import {
  McpTools,
  BranchNotFound,
  Forbidden,
  GroupId,
  NotFound,
  SprintCompletedImmutable,
  TicketId,
  type TicketListQuery,
  type User
} from "@pp/shared"
import * as Context from "effect/Context"
import * as DateTime from "effect/DateTime"
import * as Effect from "effect/Effect"
import * as Layer from "effect/Layer"
import * as Schema from "effect/Schema"

import { currentUserStorage } from "./currentUserStorage"
import { registerAllTools } from "./dispatch"
import { handlers } from "./handlers"

type ToolResult = {
  content: ReadonlyArray<{ type: "text"; text: string }>
  isError?: boolean
}

type HandlerServices =
  ReturnType<typeof handlers.me> extends Effect.Effect<
    infer _A,
    infer _E,
    infer R
  >
    ? R
    : never

type Registered = Map<string, (input: unknown) => Promise<ToolResult>>

const parseJson = (text: string) => JSON.parse(text)

const register = (runtime: Context.Context<HandlerServices>): Registered => {
  const registered: Registered = new Map()
  const fakeServer = captureToolCalls(registered)
  registerAllTools(
    fakeServer as Parameters<typeof registerAllTools>[0],
    runtime,
    handlers
  )
  return registered
}

const captureToolCalls = (
  registered: Map<string, (input: unknown) => Promise<ToolResult>>
) => ({
  setRequestHandler: (
    schema: unknown,
    handler: (request: CallToolRequest) => Promise<ToolResult>
  ) => {
    if (schema !== CallToolRequestSchema) return
    for (const name of Object.keys(McpTools)) {
      registered.set(name, (input) =>
        handler({
          method: "tools/call",
          params: {
            name,
            arguments: Schema.decodeUnknownSync(
              Schema.Record(Schema.String, Schema.Unknown)
            )(input)
          }
        })
      )
    }
  }
})

const decodeTicketId = Schema.decodeUnknownSync(TicketId)
const isoDate = (s: string) => DateTime.toDate(DateTime.makeUnsafe(s))

const fakeTicket = {
  id: decodeTicketId("T-1"),
  title: "first",
  status: "todo" as const,
  type: "feat" as const,
  priority: "med" as const,
  tags: [],
  branch: null,
  pr: null,
  prState: null,
  lastTransitionedPr: null,
  gitState: { tag: "no_branch" as const },
  assignees: [],
  archivedAt: null,
  createdBy: "u-1",
  createdAt: isoDate("2026-05-01T00:00:00.000Z"),
  updatedAt: isoDate("2026-05-10T00:00:00.000Z")
}

const capturedListLimits: Array<number | undefined> = []
const capturedListQueries: Array<TicketListQuery> = []

const TicketsStub = Layer.succeed(Tickets, {
  list: (
    _orgSlug: string,
    _userId: string,
    _slug: string,
    query: TicketListQuery,
    limit?: number
  ) => {
    capturedListLimits.push(limit)
    capturedListQueries.push(query)
    const all = Array.from({ length: 25 }, (_, i) => ({
      ticket: { ...fakeTicket, id: decodeTicketId(`T-${i + 1}`) },
      orderKey: `${i + 1}`.padStart(4, "0")
    }))
    const effective = limit ?? all.length
    return Effect.succeed({
      items: all.slice(0, effective),
      nextCursor: effective < all.length ? "cursor-next" : null
    })
  }
} as unknown as TicketsShape)

const fakeUser = { id: "u-1" } as User
const withFakeUser = <T>(fn: () => Promise<T>) =>
  currentUserStorage.run(fakeUser, fn)
const EmptyStub = <T>(tag: T) => Layer.succeed(tag as any, {})

const ProjectsStub = Layer.succeed(Projects, {
  requireMember: (_o: any, _u: any, _s: any) =>
    Effect.succeed({ role: "admin" } as any),
  requireRole: (_o: any, _u: any, _s: any) =>
    Effect.succeed({ role: "admin" } as any)
} as unknown as ProjectsShape)

const ticketIndexProject: TicketIndexProject = {
  orgSlug: "acme",
  organizationId: "org-1",
  projectId: "project-1",
  projectSlug: "demo"
}

const TicketIndexStub = Layer.succeed(TicketIndex, {
  projectsFor: () => Effect.succeed([]),
  assignedTo: () => Effect.succeed([]),
  touchedBy: () => Effect.succeed([]),
  countAssigned: () => Effect.succeed(0),
  assignedPerProject: () => Effect.succeed([]),
  projectFor: (_o: any, _s: any) => Effect.succeed(ticketIndexProject),
  reconcileProject: (project: TicketIndexProject, options?: any) =>
    Effect.succeed({
      project,
      drift: { missing: ["T-2"], orphaned: ["T-9"], stale: ["T-1"] },
      rebuilt: options?.force === true,
      indexed: 3,
      skipped: 1
    })
} as unknown as TicketIndexShape)

const ProjectDocsStub = Layer.succeed(ProjectDocs, {
  readRaw: (_o: any, _s: any) =>
    Effect.succeed({
      path: "orgs/acme/projects/demo/project.md",
      content: "---\nslug: demo\n---\n# Demo\n"
    })
} as unknown as ProjectDocsShape)

const GroupDocsStub = Layer.succeed(GroupDocs, {
  readRaw: (_o: any, _s: any, _id: any) =>
    Effect.succeed({
      path: "orgs/acme/projects/demo/groups/G-1.md",
      content: "---\nid: G-1\n---\n# Sprint 1\n"
    })
} as unknown as GroupDocsShape)

const TicketDocsStub = Layer.succeed(TicketDocs, {
  readRaw: (_o: any, _s: any, _id: any) =>
    Effect.succeed({
      path: "orgs/acme/projects/demo/tickets/T-1.md",
      content: "---\nid: T-1\n---\n# Fix it\n"
    })
} as unknown as TicketDocsShape)

const ProjectStatusesStub = Layer.succeed(ProjectStatuses, {
  list: (_o: string, _u: string, _s: string) =>
    Effect.succeed(
      Schema.decodeSync(McpTools.list_statuses.output)([
        {
          slug: "code_test",
          label: "Code Test",
          icon: "ShieldCheck",
          color: "#3b82f6",
          orderKey: "a0",
          createdBy: "u-1",
          createdAt: "2026-05-01T00:00:00.000Z"
        }
      ])
    )
} as unknown as ProjectStatusesShape)

const TestLayer = Layer.mergeAll(
  EmptyStub(AttachmentUploads.AttachmentUploads),
  EmptyStub(OrgStorage.OrgStorage),
  TicketsStub,
  ProjectsStub,
  EmptyStub(Comments),
  EmptyStub(Groups),
  EmptyStub(Tags),
  EmptyStub(Users),
  EmptyStub(BetterAuth),
  ProjectDocsStub,
  GroupDocsStub,
  TicketDocsStub,
  TicketIndexStub,
  ProjectStatusesStub
)

describe("MCP dispatcher → list_tickets", () => {
  it.effect("threads the requested limit through to Tickets.list", () =>
    Effect.gen(function* () {
      capturedListLimits.length = 0
      capturedListQueries.length = 0
      const runtime = yield* Effect.context<HandlerServices>()
      const registered = register(runtime)
      const cb = registered.get("list_tickets")
      expect(cb).toBeDefined()
      const result = yield* Effect.promise(() =>
        withFakeUser(() =>
          cb!({
            orgSlug: "acme",
            projectSlug: "demo",
            status: ["todo"],
            limit: 10
          })
        )
      )

      expect(result.isError).toBeUndefined()
      const text = result.content[0].text
      const payload = parseJson(text)
      expect(capturedListLimits).toEqual([10])
      expect(capturedListQueries[0].status).toEqual(["todo"])
      expect(payload.items).toHaveLength(10)
      expect(payload.items[0].id).toBe("T-1")
      expect(payload.nextCursor).toBe("cursor-next")
    }).pipe(Effect.provide(TestLayer))
  )
})

describe("MCP dispatcher → list_statuses", () => {
  it.effect("returns both the stable slug and user-facing label", () =>
    Effect.gen(function* () {
      const runtime = yield* Effect.context<HandlerServices>()
      const registered = register(runtime)
      const result = yield* Effect.promise(() =>
        withFakeUser(() =>
          registered.get("list_statuses")!({
            orgSlug: "acme",
            projectSlug: "demo"
          })
        )
      )

      expect(result.isError).toBeUndefined()
      expect(parseJson(result.content[0].text)).toEqual([
        expect.objectContaining({ slug: "code_test", label: "Code Test" })
      ])
    }).pipe(Effect.provide(TestLayer))
  )
})

describe("MCP dispatcher → doc tools", () => {
  it.effect("get_project_doc returns DocFile-shaped JSON envelope", () =>
    Effect.gen(function* () {
      const registered = register(yield* Effect.context<HandlerServices>())
      const cb = registered.get("get_project_doc")
      expect(cb).toBeDefined()
      const result = yield* Effect.promise(() =>
        withFakeUser(() => cb!({ orgSlug: "acme", projectSlug: "demo" }))
      )

      expect(result.isError).toBeUndefined()
      const payload = parseJson(result.content[0].text)
      expect(payload).toEqual({
        path: "orgs/acme/projects/demo/project.md",
        content: "---\nslug: demo\n---\n# Demo\n"
      })
    }).pipe(Effect.provide(TestLayer))
  )

  it.effect("get_group_doc returns DocFile-shaped JSON envelope", () =>
    Effect.gen(function* () {
      const registered = register(yield* Effect.context<HandlerServices>())
      const cb = registered.get("get_group_doc")
      expect(cb).toBeDefined()
      const result = yield* Effect.promise(() =>
        withFakeUser(() =>
          cb!({ orgSlug: "acme", projectSlug: "demo", id: "G-1" })
        )
      )

      expect(result.isError).toBeUndefined()
      const payload = parseJson(result.content[0].text)
      expect(payload.path).toBe("orgs/acme/projects/demo/groups/G-1.md")
      expect(payload.content).toContain("# Sprint 1")
    }).pipe(Effect.provide(TestLayer))
  )

  it.effect("get_ticket_doc returns DocFile-shaped JSON envelope", () =>
    Effect.gen(function* () {
      const registered = register(yield* Effect.context<HandlerServices>())
      const cb = registered.get("get_ticket_doc")
      expect(cb).toBeDefined()
      const result = yield* Effect.promise(() =>
        withFakeUser(() =>
          cb!({ orgSlug: "acme", projectSlug: "demo", id: "T-1" })
        )
      )

      expect(result.isError).toBeUndefined()
      const payload = parseJson(result.content[0].text)
      expect(payload.path).toBe("orgs/acme/projects/demo/tickets/T-1.md")
      expect(payload.content).toContain("# Fix it")
    }).pipe(Effect.provide(TestLayer))
  )

  it.effect.skip("placeholder", () => Effect.void)
})

describe("MCP dispatcher → write tools", () => {
  const fakeTicketDetail = {
    ...fakeTicket,
    creator: null,
    updater: null,
    body: "## Steps\n- repro\n"
  }

  const captured: {
    create?: any
    update?: any
    attach?: any
    createComment?: any
  } = {}

  const WriteTicketsStub = Layer.succeed(Tickets, {
    create: (_o: any, _u: any, _s: any, input: any) => {
      captured.create = input
      return Effect.succeed({ ...fakeTicketDetail, ...input })
    },
    update: (_o: any, _u: any, _s: any, _id: any, input: any) => {
      captured.update = input
      return Effect.succeed({
        ticket: {
          ...fakeTicketDetail,
          tags: input.tags ?? fakeTicketDetail.tags,
          assignees: input.assignees ?? fakeTicketDetail.assignees
        },
        orderKey: null
      })
    },
    attachBranch: (_o: any, _u: any, _s: any, _id: any, input: any) => {
      captured.attach = input
      if (input.name === "missing/branch") {
        return Effect.fail(new BranchNotFound({ name: input.name }))
      }
      return Effect.succeed({ ...fakeTicketDetail, branch: input.name })
    }
  } as unknown as TicketsShape)

  const WriteCommentsStub = Layer.succeed(Comments, {
    create: (
      _o: any,
      _u: any,
      _s: any,
      ticketId: any,
      input: { body: string }
    ) => {
      captured.createComment = { ticketId, body: input.body }
      return Effect.succeed({
        id: "c_test1234",
        ticketId,
        projectSlug: "demo",
        author: {
          id: "u-1",
          username: null,
          name: "User",
          email: "u@example.com",
          image: null,
          createdAt: isoDate("2026-05-01T00:00:00.000Z"),
          activeOrgSlug: null,
          personalGithub: {
            connected: false
          },
          editorPreference: "github",
          personalEverhour: {
            connected: false,
            everhourUserId: null,
            name: null,
            email: null,
            lastVerifiedAt: null,
            lastCheckError: null
          }
        },
        body: input.body,
        createdAt: isoDate("2026-05-13T00:00:00.000Z"),
        editedAt: null
      })
    }
  } as unknown as CommentsShape)

  const WriteTestLayer = Layer.mergeAll(
    WriteTicketsStub,
    WriteCommentsStub,
    EmptyStub(AttachmentUploads.AttachmentUploads),
    EmptyStub(OrgStorage.OrgStorage),
    ProjectsStub,
    EmptyStub(Groups),
    EmptyStub(Tags),
    EmptyStub(Users),
    EmptyStub(BetterAuth),
    ProjectDocsStub,
    GroupDocsStub,
    TicketDocsStub,
    TicketIndexStub
  )

  it.effect("create_ticket forwards all fields and returns TicketDetail", () =>
    Effect.gen(function* () {
      captured.create = undefined
      const registered = register(yield* Effect.context<HandlerServices>())
      const cb = registered.get("create_ticket")!
      yield* Effect.promise(async () => {
        const result = await withFakeUser(() =>
          cb({
            orgSlug: "acme",
            projectSlug: "demo",
            title: "rich title",
            status: "in_progress",
            priority: "high",
            type: "bug",
            tags: [],
            assignees: ["u-1"],
            body: "## Repro\n"
          })
        )

        expect(result.isError).toBeUndefined()
        const payload = parseJson(result.content[0].text)
        expect(payload.title).toBe("rich title")
        expect(payload.status).toBe("in_progress")
        expect(payload.priority).toBe("high")
        expect(payload.body).toBe("## Repro\n")
        expect(captured.create).toMatchObject({
          title: "rich title",
          status: "in_progress",
          assignees: ["u-1"]
        })
      })
    }).pipe(Effect.provide(WriteTestLayer))
  )

  it.effect("update_ticket passes empty tags array through to clear list", () =>
    Effect.gen(function* () {
      captured.update = undefined
      const registered = register(yield* Effect.context<HandlerServices>())
      const cb = registered.get("update_ticket")!
      yield* Effect.promise(async () => {
        const result = await withFakeUser(() =>
          cb({
            orgSlug: "acme",
            projectSlug: "demo",
            id: "T-1",
            tags: []
          })
        )

        expect(result.isError).toBeUndefined()
        const payload = parseJson(result.content[0].text)
        expect(payload.tags).toEqual([])
        expect(captured.update).toEqual({ tags: [] })
      })
    }).pipe(Effect.provide(WriteTestLayer))
  )

  it.effect("create_comment returns the created comment", () =>
    Effect.gen(function* () {
      captured.createComment = undefined
      const registered = register(yield* Effect.context<HandlerServices>())
      const cb = registered.get("create_comment")!
      yield* Effect.promise(async () => {
        const result = await withFakeUser(() =>
          cb({
            orgSlug: "acme",
            projectSlug: "demo",
            ticketId: "T-1",
            body: "Opened PR #42."
          })
        )

        expect(result.isError).toBeUndefined()
        const payload = parseJson(result.content[0].text)
        expect(payload.body).toBe("Opened PR #42.")
        expect(payload.ticketId).toBe("T-1")
        expect(captured.createComment).toEqual({
          ticketId: "T-1",
          body: "Opened PR #42."
        })
      })
    }).pipe(Effect.provide(WriteTestLayer))
  )

  it.effect("attach_branch returns ticket with branch set on happy path", () =>
    Effect.gen(function* () {
      const registered = register(yield* Effect.context<HandlerServices>())
      const cb = registered.get("attach_branch")!
      yield* Effect.promise(async () => {
        const result = await withFakeUser(() =>
          cb({
            orgSlug: "acme",
            projectSlug: "demo",
            id: "T-1",
            name: "feature/ok"
          })
        )

        expect(result.isError).toBeUndefined()
        const payload = parseJson(result.content[0].text)
        expect(payload.branch).toBe("feature/ok")
      })
    }).pipe(Effect.provide(WriteTestLayer))
  )

  it.effect("attach_branch surfaces BranchNotFound cleanly", () =>
    Effect.gen(function* () {
      const registered = register(yield* Effect.context<HandlerServices>())
      const cb = registered.get("attach_branch")!
      yield* Effect.promise(async () => {
        const result = await withFakeUser(() =>
          cb({
            orgSlug: "acme",
            projectSlug: "demo",
            id: "T-1",
            name: "missing/branch"
          })
        )

        expect(result.isError).toBe(true)
        expect(result.content[0].text.toLowerCase()).toContain(
          "branch not found"
        )
      })
    }).pipe(Effect.provide(WriteTestLayer))
  )

  const ForbiddenProjectsStub = Layer.succeed(Projects, {
    requireRole: (_o: any, _u: any, _s: any) => Effect.fail(new Forbidden())
  } as unknown as ProjectsShape)
  const ForbiddenLayer = Layer.mergeAll(
    EmptyStub(AttachmentUploads.AttachmentUploads),
    EmptyStub(OrgStorage.OrgStorage),
    WriteTicketsStub,
    WriteCommentsStub,
    ForbiddenProjectsStub,
    EmptyStub(Groups),
    EmptyStub(Tags),
    EmptyStub(Users),
    EmptyStub(BetterAuth),
    ProjectDocsStub,
    GroupDocsStub,
    TicketDocsStub,
    TicketIndexStub
  )
  it.effect(
    "rebuild_ticket_index force rebuilds and returns the detected drift",
    () =>
      Effect.gen(function* () {
        const registered = register(yield* Effect.context<HandlerServices>())
        const cb = registered.get("rebuild_ticket_index")!
        yield* Effect.promise(async () => {
          const result = await withFakeUser(() =>
            cb({ orgSlug: "acme", projectSlug: "demo" })
          )

          expect(result.isError).toBeUndefined()
          const payload = parseJson(result.content[0].text)
          expect(payload).toEqual({
            orgSlug: "acme",
            projectSlug: "demo",
            rebuilt: true,
            indexed: 3,
            skipped: 1,
            drift: { missing: ["T-2"], orphaned: ["T-9"], stale: ["T-1"] }
          })
        })
      }).pipe(Effect.provide(WriteTestLayer))
  )

  it.effect(
    "rebuild_ticket_index surfaces Forbidden when the caller lacks the role",
    () =>
      Effect.gen(function* () {
        const registered = register(yield* Effect.context<HandlerServices>())
        const cb = registered.get("rebuild_ticket_index")!
        yield* Effect.promise(async () => {
          const result = await withFakeUser(() =>
            cb({ orgSlug: "acme", projectSlug: "demo" })
          )

          expect(result.isError).toBe(true)
          expect(result.content[0].text.toLowerCase()).toContain("forbidden")
        })
      }).pipe(Effect.provide(ForbiddenLayer))
  )

  it.effect.skip("placeholder2", () => Effect.void)
})

describe("MCP dispatcher → add_tickets_to_group", () => {
  const decodeGroupId = Schema.decodeUnknownSync(GroupId)

  const makeGroupsStub = (behaviour: "ok" | "completed" = "ok") => {
    const captured: {
      orgSlug?: string
      userId?: string
      slug?: string
      groupId?: string
      ticketIds?: ReadonlyArray<string>
    } = {}
    const stub = Layer.succeed(Groups, {
      addTickets: (
        orgSlug: any,
        userId: any,
        slug: any,
        groupId: any,
        ticketIds: ReadonlyArray<string>
      ) => {
        captured.orgSlug = orgSlug
        captured.userId = userId
        captured.slug = slug
        captured.groupId = groupId
        captured.ticketIds = ticketIds
        if (behaviour === "completed") {
          return Effect.fail(new SprintCompletedImmutable())
        }
        return Effect.succeed({
          target: {
            id: decodeGroupId(groupId),
            name: "Sprint 1",
            kind: "sprint" as const,
            tickets: ticketIds.map((id) => decodeTicketId(id)),
            color: "#3366ff" as any,
            startsAt: null,
            endsAt: null,
            completedAt: null,
            createdBy: "u-1",
            createdAt: isoDate("2026-04-01T00:00:00.000Z"),
            updatedAt: isoDate("2026-05-13T00:00:00.000Z"),
            body: "# Sprint 1\n"
          },
          evicted: []
        })
      }
    } as any)
    return { stub, captured }
  }

  const makeLayer = (groupsLayer: Layer.Layer<Groups>) =>
    Layer.mergeAll(
      EmptyStub(AttachmentUploads.AttachmentUploads),
      EmptyStub(OrgStorage.OrgStorage),
      EmptyStub(Tickets),
      groupsLayer,
      EmptyStub(Comments),
      ProjectsStub,
      EmptyStub(Tags),
      EmptyStub(Users),
      EmptyStub(BetterAuth),
      ProjectDocsStub,
      GroupDocsStub,
      TicketDocsStub
    )

  const registerAndCall = (
    runtime: Context.Context<HandlerServices>,
    input: unknown
  ) => {
    const registered = register(runtime)
    return {
      call: () =>
        withFakeUser(() => registered.get("add_tickets_to_group")!(input))
    }
  }

  const { stub: addTicketsStub, captured: addTicketsCaptured } =
    makeGroupsStub("ok")
  it.effect("delegates to groups.addTickets with the supplied path + ids", () =>
    Effect.gen(function* () {
      const { call } = registerAndCall(
        yield* Effect.context<HandlerServices>(),
        {
          orgSlug: "acme",
          projectSlug: "demo",
          groupId: "G-1",
          ticketIds: ["T-2", "T-2", "T-3"]
        }
      )
      const result = yield* Effect.promise(() => call())

      expect(result.isError).toBeUndefined()
      expect(addTicketsCaptured.orgSlug).toBe("acme")
      expect(addTicketsCaptured.slug).toBe("demo")
      expect(addTicketsCaptured.groupId).toBe("G-1")
      expect(addTicketsCaptured.userId).toBe("u-1")
      // Handler forwards the raw payload — the service is responsible for
      // dedup, merge, and write atomicity. Those are tested at the service
      // layer (see Layers/Groups-addTickets.test.ts).
      expect(addTicketsCaptured.ticketIds).toEqual(["T-2", "T-2", "T-3"])
    }).pipe(Effect.provide(makeLayer(addTicketsStub)))
  )

  const { stub: completedStub } = makeGroupsStub("completed")
  it.effect("surfaces SprintCompletedImmutable from the service", () =>
    Effect.gen(function* () {
      const { call } = registerAndCall(
        yield* Effect.context<HandlerServices>(),
        {
          orgSlug: "acme",
          projectSlug: "demo",
          groupId: "G-1",
          ticketIds: ["T-2"]
        }
      )
      const result = yield* Effect.promise(() => call())

      expect(result.isError).toBe(true)
      expect(result.content[0].text.toLowerCase()).toContain("sprint")
    }).pipe(Effect.provide(makeLayer(completedStub)))
  )

  it.effect.skip("placeholder", () => Effect.void)
})

describe("MCP dispatcher → sprint writes", () => {
  const decodeGroupId = Schema.decodeUnknownSync(GroupId)

  const baseGroup = (
    overrides: Partial<{ id: string; kind: string }> = {}
  ) => ({
    id: decodeGroupId(overrides.id ?? "G-1"),
    name: "Sprint 1",
    kind: (overrides.kind ?? "sprint") as any,
    tickets: [],
    color: "#3366ff" as any,
    startsAt: null,
    endsAt: null,
    completedAt: null,
    createdBy: "u-1",
    createdAt: isoDate("2026-04-01T00:00:00.000Z"),
    updatedAt: isoDate("2026-05-12T00:00:00.000Z"),
    body: "# Sprint 1\n"
  })

  const makeGroupsStub = (
    options: { kind?: string; completed?: boolean } = {}
  ) => {
    const captured: {
      createInput?: any
      updateInput?: any
      completeInput?: any
    } = {}
    const stub = Layer.succeed(Groups, {
      get: (_o: any, _u: any, _s: any, id: any) =>
        Effect.succeed(baseGroup({ id, kind: options.kind })),
      create: (_o: any, _u: any, _s: any, input: any) => {
        captured.createInput = input
        return Effect.succeed({
          id: decodeGroupId("G-9"),
          name: input.name,
          kind: input.kind ?? "sprint",
          tickets: input.tickets ?? [],
          color: input.color ?? ("#3366ff" as any),
          startsAt: input.startsAt ?? null,
          endsAt: input.endsAt ?? null,
          completedAt: null,
          createdBy: "u-1",
          createdAt: isoDate("2026-05-13T00:00:00.000Z"),
          updatedAt: isoDate("2026-05-13T00:00:00.000Z")
        })
      },
      update: (_o: any, _u: any, _s: any, id: any, input: any) => {
        captured.updateInput = input
        return Effect.succeed({
          ...baseGroup({ id, kind: options.kind }),
          ...input
        })
      },
      complete: (_o: any, _u: any, _s: any, id: any, input: any) => {
        captured.completeInput = input
        if (options.completed) {
          return Effect.fail(new SprintCompletedImmutable())
        }
        return Effect.succeed({
          target: {
            ...baseGroup({ id, kind: options.kind }),
            completedAt: isoDate("2026-05-13T00:00:00.000Z")
          },
          carried: []
        })
      }
    } as any)
    return { stub, captured }
  }

  const makeLayer = (groupsLayer: Layer.Layer<Groups>) =>
    Layer.mergeAll(
      EmptyStub(AttachmentUploads.AttachmentUploads),
      EmptyStub(OrgStorage.OrgStorage),
      EmptyStub(Tickets),
      groupsLayer,
      EmptyStub(Comments),
      ProjectsStub,
      EmptyStub(Tags),
      EmptyStub(Users),
      EmptyStub(BetterAuth),
      ProjectDocsStub,
      GroupDocsStub,
      TicketDocsStub
    )

  const registerAndCall = (
    name: string,
    runtime: Context.Context<HandlerServices>,
    input: unknown
  ) => {
    const registered = register(runtime)
    return {
      call: () => withFakeUser(() => registered.get(name)!(input))
    }
  }

  const createSprint = makeGroupsStub()
  it.effect(
    "create_sprint forces kind: 'sprint' regardless of agent input",
    () =>
      Effect.gen(function* () {
        const { call } = registerAndCall(
          "create_sprint",
          yield* Effect.context<HandlerServices>(),
          {
            orgSlug: "acme",
            projectSlug: "demo",
            name: "Sprint 5"
          }
        )
        const result = yield* Effect.promise(() => call())

        expect(result.isError).toBeUndefined()
        expect(createSprint.captured.createInput?.kind).toBe("sprint")
        expect(createSprint.captured.createInput?.name).toBe("Sprint 5")
      }).pipe(Effect.provide(makeLayer(createSprint.stub)))
  )

  const updateSprint = makeGroupsStub({ kind: "sprint" })
  it.effect("update_sprint applies the patch on a sprint-kind group", () =>
    Effect.gen(function* () {
      const { call } = registerAndCall(
        "update_sprint",
        yield* Effect.context<HandlerServices>(),
        {
          orgSlug: "acme",
          projectSlug: "demo",
          id: "G-1",
          name: "Sprint 5 (renamed)",
          body: "## Goal\n- ship it"
        }
      )
      const result = yield* Effect.promise(() => call())

      expect(result.isError).toBeUndefined()
      expect(updateSprint.captured.updateInput).toEqual({
        name: "Sprint 5 (renamed)",
        body: "## Goal\n- ship it"
      })
    }).pipe(Effect.provide(makeLayer(updateSprint.stub)))
  )

  const nonSprintUpdate = makeGroupsStub({ kind: "epic" })
  it.effect("update_sprint rejects non-sprint groups with Validation", () =>
    Effect.gen(function* () {
      const { call } = registerAndCall(
        "update_sprint",
        yield* Effect.context<HandlerServices>(),
        {
          orgSlug: "acme",
          projectSlug: "demo",
          id: "G-1",
          name: "should fail"
        }
      )
      const result = yield* Effect.promise(() => call())

      expect(result.isError).toBe(true)
      expect(result.content[0].text.toLowerCase()).toContain("not_a_sprint")
      expect(nonSprintUpdate.captured.updateInput).toBeUndefined()
    }).pipe(Effect.provide(makeLayer(nonSprintUpdate.stub)))
  )

  const completeSprint = makeGroupsStub({ kind: "sprint" })
  it.effect("complete_sprint forwards the destination", () =>
    Effect.gen(function* () {
      const { call } = registerAndCall(
        "complete_sprint",
        yield* Effect.context<HandlerServices>(),
        {
          orgSlug: "acme",
          projectSlug: "demo",
          id: "G-1",
          destination: { kind: "backlog" }
        }
      )
      const result = yield* Effect.promise(() => call())

      expect(result.isError).toBeUndefined()
      expect(completeSprint.captured.completeInput).toEqual({
        destination: { kind: "backlog" }
      })
    }).pipe(Effect.provide(makeLayer(completeSprint.stub)))
  )

  const nonSprintComplete = makeGroupsStub({ kind: "milestone" })
  it.effect("complete_sprint rejects non-sprint groups with Validation", () =>
    Effect.gen(function* () {
      const { call } = registerAndCall(
        "complete_sprint",
        yield* Effect.context<HandlerServices>(),
        {
          orgSlug: "acme",
          projectSlug: "demo",
          id: "G-1",
          destination: { kind: "backlog" }
        }
      )
      const result = yield* Effect.promise(() => call())

      expect(result.isError).toBe(true)
      expect(result.content[0].text.toLowerCase()).toContain("not_a_sprint")
      expect(nonSprintComplete.captured.completeInput).toBeUndefined()
    }).pipe(Effect.provide(makeLayer(nonSprintComplete.stub)))
  )

  const completedSprint = makeGroupsStub({ kind: "sprint", completed: true })
  it.effect("complete_sprint surfaces SprintCompletedImmutable", () =>
    Effect.gen(function* () {
      const { call } = registerAndCall(
        "complete_sprint",
        yield* Effect.context<HandlerServices>(),
        {
          orgSlug: "acme",
          projectSlug: "demo",
          id: "G-1",
          destination: { kind: "backlog" }
        }
      )
      const result = yield* Effect.promise(() => call())

      expect(result.isError).toBe(true)
      // Specific surfaced text — confirms SprintCompletedImmutable's mapping
      // in errorMap, not just any error class.
      expect(result.content[0].text.toLowerCase()).toContain(
        "sprint is already completed"
      )
    }).pipe(Effect.provide(makeLayer(completedSprint.stub)))
  )

  it.effect.skip("placeholder", () => Effect.void)
})

describe("MCP dispatcher → NotFound retained", () => {
  const HiddenProjectsStub = Layer.succeed(Projects, {
    requireMember: (_o: any, _u: any, _s: any) => Effect.fail(new NotFound())
  } as unknown as ProjectsShape)

  const HiddenLayer = Layer.mergeAll(
    EmptyStub(AttachmentUploads.AttachmentUploads),
    EmptyStub(OrgStorage.OrgStorage),
    TicketsStub,
    HiddenProjectsStub,
    EmptyStub(Groups),
    EmptyStub(Tags),
    EmptyStub(Users),
    EmptyStub(BetterAuth),
    ProjectDocsStub,
    GroupDocsStub,
    TicketDocsStub
  )

  it.effect(
    "get_ticket_doc returns NotFound when caller can't see the project",
    () =>
      Effect.gen(function* () {
        const registered = register(yield* Effect.context<HandlerServices>())
        const cb = registered.get("get_ticket_doc")
        const result = yield* Effect.promise(() =>
          withFakeUser(() =>
            cb!({ orgSlug: "acme", projectSlug: "demo", id: "T-1" })
          )
        )

        expect(result.isError).toBe(true)
        expect(result.content[0].text.toLowerCase()).toContain("not found")
      }).pipe(Effect.provide(HiddenLayer))
  )
})
