import { describe, expect, test } from "bun:test"
import * as Effect from "effect/Effect"
import * as DateTime from "effect/DateTime"
import * as Layer from "effect/Layer"
import * as ManagedRuntime from "effect/ManagedRuntime"
import * as Schema from "effect/Schema"
import {
  BranchNotFound,
  GroupId,
  NotFound,
  SprintCompletedImmutable,
  TicketId,
  type User
} from "@projectproject/shared"
import { currentUserStorage } from "./currentUserStorage"
import { Comments, type CommentsShape } from "../Services/Comments"
import { Tickets, type TicketsShape } from "../Services/Tickets"
import { Projects, type ProjectsShape } from "../Services/Projects"
import { Groups } from "../Services/Groups"
import { Tags } from "../Services/Tags"
import { Users } from "../Services/Users"
import { BetterAuth } from "../Services/BetterAuth"
import { ProjectDocs, type ProjectDocsShape } from "../Services/ProjectDocs"
import { GroupDocs, type GroupDocsShape } from "../Services/GroupDocs"
import { TicketDocs, type TicketDocsShape } from "../Services/TicketDocs"
import { registerAllTools } from "./dispatch"
import { handlers } from "./handlers"

const decodeTicketId = Schema.decodeUnknownSync(TicketId)
const isoDate = (s: string) => DateTime.toDate(DateTime.unsafeMake(s))

const fakeTicket = {
  id: decodeTicketId("T-1"),
  title: "first",
  status: "todo" as const,
  type: "feat" as const,
  priority: "med" as const,
  tags: [],
  branch: null,
  pr: null,
  lastTransitionedPr: null,
  assignees: [],
  createdBy: "u-1",
  createdAt: isoDate("2026-05-01T00:00:00.000Z"),
  updatedAt: isoDate("2026-05-10T00:00:00.000Z")
}

const TicketsStub = Layer.succeed(Tickets, {
  listPaged: (_o: any, _u: any, _s: any, _f: any, _c: any, _l: any) =>
    Effect.succeed({ items: [fakeTicket], nextCursor: null })
} as unknown as TicketsShape)

const fakeUser = { id: "u-1" } as User
const withFakeUser = <T>(fn: () => Promise<T>) =>
  currentUserStorage.run(fakeUser, fn)
const EmptyStub = <T>(tag: T) => Layer.succeed(tag as any, {} as any)

const ProjectsStub = Layer.succeed(Projects, {
  requireMember: (_o: any, _u: any, _s: any) =>
    Effect.succeed({ role: "admin" } as any)
} as unknown as ProjectsShape)

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

const TestLayer = Layer.mergeAll(
  TicketsStub,
  ProjectsStub,
  EmptyStub(Comments),
  EmptyStub(Groups),
  EmptyStub(Tags),
  EmptyStub(Users),
  EmptyStub(BetterAuth),
  ProjectDocsStub,
  GroupDocsStub,
  TicketDocsStub
)

describe("MCP dispatcher → list_tickets", () => {
  test("returns Page<Ticket>-shaped JSON envelope", async () => {
    const runtime = ManagedRuntime.make(TestLayer)

    const registered = new Map<
      string,
      (input: unknown) => Promise<{
        content: ReadonlyArray<{ type: "text"; text: string }>
        isError?: boolean
      }>
    >()
    const fakeServer = {
      registerTool: (
        name: string,
        _meta: unknown,
        cb: (input: unknown) => Promise<any>
      ) => {
        registered.set(name, cb)
      }
    } as any

    registerAllTools(fakeServer, runtime as any, handlers as any)

    const cb = registered.get("list_tickets")
    expect(cb).toBeDefined()
    const result = await withFakeUser(() =>
      cb!({ orgSlug: "acme", projectSlug: "demo", limit: 10 })
    )

    expect(result.isError).toBeUndefined()
    const text = result.content[0].text
    const payload = JSON.parse(text)
    expect(payload.items).toHaveLength(1)
    expect(payload.items[0].id).toBe("T-1")
    expect(payload.nextCursor).toBeNull()

    await runtime.dispose()
  })
})

describe("MCP dispatcher → doc tools", () => {
  test("get_project_doc returns DocFile-shaped JSON envelope", async () => {
    const runtime = ManagedRuntime.make(TestLayer)
    const registered = new Map<
      string,
      (input: unknown) => Promise<{
        content: ReadonlyArray<{ type: "text"; text: string }>
        isError?: boolean
      }>
    >()
    const fakeServer = {
      registerTool: (
        name: string,
        _meta: unknown,
        cb: (input: unknown) => Promise<any>
      ) => {
        registered.set(name, cb)
      }
    } as any

    registerAllTools(fakeServer, runtime as any, handlers as any)

    const cb = registered.get("get_project_doc")
    expect(cb).toBeDefined()
    const result = await withFakeUser(() =>
      cb!({ orgSlug: "acme", projectSlug: "demo" })
    )

    expect(result.isError).toBeUndefined()
    const payload = JSON.parse(result.content[0].text)
    expect(payload).toEqual({
      path: "orgs/acme/projects/demo/project.md",
      content: "---\nslug: demo\n---\n# Demo\n"
    })

    await runtime.dispose()
  })

  test("get_group_doc returns DocFile-shaped JSON envelope", async () => {
    const runtime = ManagedRuntime.make(TestLayer)
    const registered = new Map<string, (i: unknown) => Promise<any>>()
    const fakeServer = {
      registerTool: (name: string, _m: unknown, cb: any) => {
        registered.set(name, cb)
      }
    } as any
    registerAllTools(fakeServer, runtime as any, handlers as any)

    const cb = registered.get("get_group_doc")
    expect(cb).toBeDefined()
    const result = await withFakeUser(() =>
      cb!({ orgSlug: "acme", projectSlug: "demo", id: "G-1" })
    )

    expect(result.isError).toBeUndefined()
    const payload = JSON.parse(result.content[0].text)
    expect(payload.path).toBe("orgs/acme/projects/demo/groups/G-1.md")
    expect(payload.content).toContain("# Sprint 1")

    await runtime.dispose()
  })

  test("get_ticket_doc returns DocFile-shaped JSON envelope", async () => {
    const runtime = ManagedRuntime.make(TestLayer)
    const registered = new Map<string, (i: unknown) => Promise<any>>()
    const fakeServer = {
      registerTool: (name: string, _m: unknown, cb: any) => {
        registered.set(name, cb)
      }
    } as any
    registerAllTools(fakeServer, runtime as any, handlers as any)

    const cb = registered.get("get_ticket_doc")
    expect(cb).toBeDefined()
    const result = await withFakeUser(() =>
      cb!({ orgSlug: "acme", projectSlug: "demo", id: "T-1" })
    )

    expect(result.isError).toBeUndefined()
    const payload = JSON.parse(result.content[0].text)
    expect(payload.path).toBe("orgs/acme/projects/demo/tickets/T-1.md")
    expect(payload.content).toContain("# Fix it")

    await runtime.dispose()
  })

  test.skip("placeholder", () => {})
})

describe("MCP dispatcher → write tools", () => {
  const fakeTicketDetail = {
    ...fakeTicket,
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
        ...fakeTicketDetail,
        tags: input.tags ?? fakeTicketDetail.tags,
        assignees: input.assignees ?? fakeTicketDetail.assignees
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
          activeOrgSlug: null
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
    ProjectsStub,
    EmptyStub(Groups),
    EmptyStub(Tags),
    EmptyStub(Users),
    EmptyStub(BetterAuth),
    ProjectDocsStub,
    GroupDocsStub,
    TicketDocsStub
  )

  const makeServer = (layer: Layer.Layer<any, never, never>) => {
    const runtime = ManagedRuntime.make(layer)
    const registered = new Map<string, (i: unknown) => Promise<any>>()
    const fakeServer = {
      registerTool: (name: string, _m: unknown, cb: any) => {
        registered.set(name, cb)
      }
    } as any
    registerAllTools(fakeServer, runtime as any, handlers as any)
    return { runtime, registered }
  }

  test("create_ticket forwards all fields and returns TicketDetail", async () => {
    captured.create = undefined
    const { runtime, registered } = makeServer(WriteTestLayer)
    const cb = registered.get("create_ticket")!
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
    const payload = JSON.parse(result.content[0].text)
    expect(payload.title).toBe("rich title")
    expect(payload.status).toBe("in_progress")
    expect(payload.priority).toBe("high")
    expect(payload.body).toBe("## Repro\n")
    expect(captured.create).toMatchObject({
      title: "rich title",
      status: "in_progress",
      assignees: ["u-1"]
    })

    await runtime.dispose()
  })

  test("update_ticket passes empty tags array through to clear list", async () => {
    captured.update = undefined
    const { runtime, registered } = makeServer(WriteTestLayer)
    const cb = registered.get("update_ticket")!
    const result = await withFakeUser(() =>
      cb({
        orgSlug: "acme",
        projectSlug: "demo",
        id: "T-1",
        tags: []
      })
    )

    expect(result.isError).toBeUndefined()
    const payload = JSON.parse(result.content[0].text)
    expect(payload.tags).toEqual([])
    expect(captured.update).toEqual({ tags: [] })

    await runtime.dispose()
  })

  test("create_comment returns the created comment", async () => {
    captured.createComment = undefined
    const { runtime, registered } = makeServer(WriteTestLayer)
    const cb = registered.get("create_comment")!
    const result = await withFakeUser(() =>
      cb({
        orgSlug: "acme",
        projectSlug: "demo",
        ticketId: "T-1",
        body: "Opened PR #42."
      })
    )

    expect(result.isError).toBeUndefined()
    const payload = JSON.parse(result.content[0].text)
    expect(payload.body).toBe("Opened PR #42.")
    expect(payload.ticketId).toBe("T-1")
    expect(captured.createComment).toEqual({
      ticketId: "T-1",
      body: "Opened PR #42."
    })

    await runtime.dispose()
  })

  test("attach_branch returns ticket with branch set on happy path", async () => {
    const { runtime, registered } = makeServer(WriteTestLayer)
    const cb = registered.get("attach_branch")!
    const result = await withFakeUser(() =>
      cb({
        orgSlug: "acme",
        projectSlug: "demo",
        id: "T-1",
        name: "feature/ok"
      })
    )

    expect(result.isError).toBeUndefined()
    const payload = JSON.parse(result.content[0].text)
    expect(payload.branch).toBe("feature/ok")

    await runtime.dispose()
  })

  test("attach_branch surfaces BranchNotFound cleanly", async () => {
    const { runtime, registered } = makeServer(WriteTestLayer)
    const cb = registered.get("attach_branch")!
    const result = await withFakeUser(() =>
      cb({
        orgSlug: "acme",
        projectSlug: "demo",
        id: "T-1",
        name: "missing/branch"
      })
    )

    expect(result.isError).toBe(true)
    expect(result.content[0].text.toLowerCase()).toContain("branch not found")

    await runtime.dispose()
  })

  test.skip("placeholder2", () => {})
})

describe("MCP dispatcher → add_tickets_to_group", () => {
  const decodeGroupId = Schema.decodeUnknownSync(GroupId)

  const makeGroupsStub = (
    initialTickets: ReadonlyArray<string>,
    options: { completed?: boolean } = {}
  ) => {
    let storedTickets: ReadonlyArray<string> = [...initialTickets]
    const captured: { lastWrite?: ReadonlyArray<string> } = {}
    const stub = Layer.succeed(Groups, {
      get: (_o: any, _u: any, _s: any, id: any) =>
        Effect.succeed({
          id: decodeGroupId(id),
          name: "Sprint 1",
          kind: "sprint" as const,
          tickets: storedTickets.map((id) => decodeTicketId(id)),
          color: "#3366ff" as any,
          startsAt: null,
          endsAt: null,
          completedAt: options.completed ? isoDate("2026-05-01T00:00:00.000Z") : null,
          createdBy: "u-1",
          createdAt: isoDate("2026-04-01T00:00:00.000Z"),
          updatedAt: isoDate("2026-05-12T00:00:00.000Z"),
          body: "# Sprint 1\n"
        }),
      updateTickets: (
        _o: any,
        _u: any,
        _s: any,
        groupId: any,
        input: { tickets: ReadonlyArray<string> }
      ) => {
        if (options.completed) {
          return Effect.fail(new SprintCompletedImmutable())
        }
        captured.lastWrite = input.tickets
        storedTickets = [...input.tickets]
        return Effect.succeed({
          target: {
            id: decodeGroupId(groupId),
            name: "Sprint 1",
            kind: "sprint" as const,
            tickets: storedTickets.map((id) => decodeTicketId(id)),
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
    return { stub, captured, getStored: () => storedTickets }
  }

  const makeLayer = (groupsLayer: Layer.Layer<Groups>) =>
    Layer.mergeAll(
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
    layer: Layer.Layer<any, never, never>,
    input: unknown
  ) => {
    const runtime = ManagedRuntime.make(layer)
    const registered = new Map<string, (i: unknown) => Promise<any>>()
    const fakeServer = {
      registerTool: (name: string, _m: unknown, cb: any) =>
        registered.set(name, cb)
    } as any
    registerAllTools(fakeServer, runtime as any, handlers as any)
    return {
      runtime,
      call: () => withFakeUser(() => registered.get("add_tickets_to_group")!(input))
    }
  }

  test("appends ticket ids to the group's existing list", async () => {
    const { stub, captured, getStored } = makeGroupsStub(["T-1"])
    const { runtime, call } = registerAndCall(makeLayer(stub), {
      orgSlug: "acme",
      projectSlug: "demo",
      groupId: "G-1",
      ticketIds: ["T-2", "T-3"]
    })
    const result = await call()

    expect(result.isError).toBeUndefined()
    expect(captured.lastWrite).toEqual(["T-1", "T-2", "T-3"])
    expect(getStored()).toEqual(["T-1", "T-2", "T-3"])

    await runtime.dispose()
  })

  test("deduplicates ids already in the group", async () => {
    const { stub, captured } = makeGroupsStub(["T-1", "T-2"])
    const { runtime, call } = registerAndCall(makeLayer(stub), {
      orgSlug: "acme",
      projectSlug: "demo",
      groupId: "G-1",
      ticketIds: ["T-1", "T-3"]
    })
    const result = await call()

    expect(result.isError).toBeUndefined()
    expect(captured.lastWrite).toEqual(["T-1", "T-2", "T-3"])

    await runtime.dispose()
  })

  test("deduplicates ids that repeat within the same request payload", async () => {
    const { stub, captured } = makeGroupsStub(["T-1"])
    const { runtime, call } = registerAndCall(makeLayer(stub), {
      orgSlug: "acme",
      projectSlug: "demo",
      groupId: "G-1",
      ticketIds: ["T-2", "T-2", "T-3", "T-3", "T-2"]
    })
    const result = await call()

    expect(result.isError).toBeUndefined()
    expect(captured.lastWrite).toEqual(["T-1", "T-2", "T-3"])

    await runtime.dispose()
  })

  test("is a no-op when every supplied id is already a member", async () => {
    const { stub, captured } = makeGroupsStub(["T-1", "T-2"])
    const { runtime, call } = registerAndCall(makeLayer(stub), {
      orgSlug: "acme",
      projectSlug: "demo",
      groupId: "G-1",
      ticketIds: ["T-1"]
    })
    const result = await call()

    expect(result.isError).toBeUndefined()
    expect(captured.lastWrite).toEqual(["T-1", "T-2"])

    await runtime.dispose()
  })

  test("surfaces SprintCompletedImmutable for completed sprints", async () => {
    const { stub, captured } = makeGroupsStub(["T-1"], { completed: true })
    const { runtime, call } = registerAndCall(makeLayer(stub), {
      orgSlug: "acme",
      projectSlug: "demo",
      groupId: "G-1",
      ticketIds: ["T-2"]
    })
    const result = await call()

    expect(result.isError).toBe(true)
    expect(result.content[0].text.toLowerCase()).toContain("sprint")
    expect(captured.lastWrite).toBeUndefined()
    await runtime.dispose()
  })

  test.skip("placeholder", () => {})
})

describe("MCP dispatcher → NotFound retained", () => {
  test("get_ticket_doc returns NotFound when caller can't see the project", async () => {
    const HiddenProjectsStub = Layer.succeed(Projects, {
      requireMember: (_o: any, _u: any, _s: any) =>
        Effect.fail(new NotFound())
    } as unknown as ProjectsShape)

    const HiddenLayer = Layer.mergeAll(
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

    const runtime = ManagedRuntime.make(HiddenLayer)
    const registered = new Map<string, (i: unknown) => Promise<any>>()
    const fakeServer = {
      registerTool: (name: string, _m: unknown, cb: any) => {
        registered.set(name, cb)
      }
    } as any
    registerAllTools(fakeServer, runtime as any, handlers as any)

    const cb = registered.get("get_ticket_doc")
    const result = await withFakeUser(() =>
      cb!({ orgSlug: "acme", projectSlug: "demo", id: "T-1" })
    )

    expect(result.isError).toBe(true)
    expect(result.content[0].text.toLowerCase()).toContain("not found")

    await runtime.dispose()
  })
})
