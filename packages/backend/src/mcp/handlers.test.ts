import { describe, expect, test } from "bun:test"
import * as Effect from "effect/Effect"
import * as DateTime from "effect/DateTime"
import * as Layer from "effect/Layer"
import * as ManagedRuntime from "effect/ManagedRuntime"
import * as Schema from "effect/Schema"
import { CurrentUser, NotFound, TicketId } from "@projectproject/shared"
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

const CurrentUserStub = Layer.succeed(CurrentUser, { id: "u-1" } as any)
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
  CurrentUserStub,
  TicketsStub,
  ProjectsStub,
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
    const result = await cb!({
      orgSlug: "acme",
      projectSlug: "demo",
      limit: 10
    })

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
    const result = await cb!({ orgSlug: "acme", projectSlug: "demo" })

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
    const result = await cb!({
      orgSlug: "acme",
      projectSlug: "demo",
      id: "G-1"
    })

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
    const result = await cb!({
      orgSlug: "acme",
      projectSlug: "demo",
      id: "T-1"
    })

    expect(result.isError).toBeUndefined()
    const payload = JSON.parse(result.content[0].text)
    expect(payload.path).toBe("orgs/acme/projects/demo/tickets/T-1.md")
    expect(payload.content).toContain("# Fix it")

    await runtime.dispose()
  })
})
