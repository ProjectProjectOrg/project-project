import { it } from "@effect/vitest"
import * as DateTime from "effect/DateTime"
import * as Effect from "effect/Effect"
import * as Layer from "effect/Layer"
import * as Schema from "effect/Schema"
import { expect } from "vitest"
import {
  TicketId,
  type ProjectDetail,
  type Role
} from "@projectproject/shared"
import { Db } from "../Services/Db"
import { GitHub, type GitHubShape } from "../Services/GitHub"
import { Groups, type GroupsShape } from "../Services/Groups"
import { Projects, type ProjectsShape } from "../Services/Projects"
import {
  MalformedTicketDocument,
  TicketDocs,
  type TicketDocsShape,
  type TicketDocument
} from "../Services/TicketDocs"
import { TicketsLive } from "../Layers/Tickets"
import { Tickets } from "./Tickets"

const ticketId = Schema.decodeUnknownSync(TicketId)
const isoDate = (s: string) => DateTime.toDate(DateTime.unsafeMake(s))

function unexpectedCall(service: string, method: string): Effect.Effect<never> {
  return Effect.die(new Error(`unexpected ${service}.${method} call`))
}

function ticket(overrides: Partial<TicketDocument> = {}): TicketDocument {
  return {
    id: ticketId("T-1"),
    title: "Good ticket",
    status: "todo",
    type: "feat",
    priority: "med",
    tags: [],
    branch: null,
    pr: null,
    lastTransitionedPr: null,
    assignees: [],
    createdBy: "user-1",
    createdAt: isoDate("2026-01-01T00:00:00.000Z"),
    updatedAt: isoDate("2026-01-02T00:00:00.000Z"),
    body: "# Good ticket\n",
    ...overrides
  }
}

function projectDetail(role: Role = "member"): ProjectDetail {
  return {
    org: "org",
    slug: "project",
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

const ProjectsStub = Layer.succeed(Projects, {
  list: () => unexpectedCall("Projects", "list"),
  listPaged: () => unexpectedCall("Projects", "listPaged"),
  listMembersPaged: () => unexpectedCall("Projects", "listMembersPaged"),
  create: () => unexpectedCall("Projects", "create"),
  get: () => Effect.succeed(projectDetail()),
  update: () => unexpectedCall("Projects", "update"),
  remove: () => unexpectedCall("Projects", "remove"),
  requireMember: () => Effect.succeed({ role: "member" as const }),
  requireRole: () => Effect.succeed({ role: "member" as const }),
  addMember: () => unexpectedCall("Projects", "addMember"),
  updateMember: () => unexpectedCall("Projects", "updateMember"),
  removeMember: () => unexpectedCall("Projects", "removeMember"),
  connectGithub: () => unexpectedCall("Projects", "connectGithub"),
  disconnectGithub: () => unexpectedCall("Projects", "disconnectGithub")
} satisfies ProjectsShape)

const GitHubStub = Layer.succeed(GitHub, {
  listUserRepos: () => unexpectedCall("GitHub", "listUserRepos"),
  verifyAccess: () => unexpectedCall("GitHub", "verifyAccess"),
  createBranch: () => unexpectedCall("GitHub", "createBranch"),
  openPullRequest: () => unexpectedCall("GitHub", "openPullRequest"),
  fetchProjectStates: () => unexpectedCall("GitHub", "fetchProjectStates"),
  listBranches: () => unexpectedCall("GitHub", "listBranches"),
  branchExists: () => unexpectedCall("GitHub", "branchExists")
} satisfies GitHubShape)

const DbStub = Layer.succeed(
  Db,
  new Proxy(
    {},
    {
      get: (_target, prop) =>
        (..._args: ReadonlyArray<unknown>) =>
          unexpectedCall("Db", String(prop))
    }
  ) as never
)

const GroupsStub = Layer.succeed(Groups, {
  list: () => unexpectedCall("Groups", "list"),
  listPaged: () => unexpectedCall("Groups", "listPaged"),
  listSprintsPaged: () => unexpectedCall("Groups", "listSprintsPaged"),
  get: () => unexpectedCall("Groups", "get"),
  create: () => unexpectedCall("Groups", "create"),
  update: () => unexpectedCall("Groups", "update"),
  updateTickets: () => unexpectedCall("Groups", "updateTickets"),
  addTickets: () => unexpectedCall("Groups", "addTickets"),
  updateTicketOrder: () => unexpectedCall("Groups", "updateTicketOrder"),
  complete: () => unexpectedCall("Groups", "complete"),
  remove: () => unexpectedCall("Groups", "remove"),
  removeTicketFromAllGroups: () =>
    unexpectedCall("Groups", "removeTicketFromAllGroups")
} satisfies GroupsShape)

it.effect("Tickets.list skips malformed ticket documents", () => {
  const docs = Layer.succeed(TicketDocs, {
    listIds: () => Effect.succeed([ticketId("T-1"), ticketId("T-2")]),
    read: (_org, _slug, id) =>
      id === "T-1"
        ? Effect.succeed(ticket())
        : Effect.fail(
            new MalformedTicketDocument({
              orgSlug: "org",
              slug: "project",
              ticketId: id,
              path: `orgs/org/projects/project/tickets/${id}.md`,
              reason: "invalid_frontmatter",
              cause: undefined
            })
          ),
    create: () => unexpectedCall("TicketDocs", "create"),
    write: () => unexpectedCall("TicketDocs", "write"),
    remove: () => unexpectedCall("TicketDocs", "remove"),
    readRaw: () => unexpectedCall("TicketDocs", "readRaw")
  } satisfies TicketDocsShape)

  return Effect.gen(function* () {
    const tickets = yield* Tickets
    const result = yield* tickets.list("org", "user-1", "project")

    expect(result.map((t) => t.id)).toEqual(["T-1"])
  }).pipe(
    Effect.provide(
      TicketsLive.pipe(
        Layer.provide(docs),
        Layer.provide(ProjectsStub),
        Layer.provide(GitHubStub),
        Layer.provide(GroupsStub),
        Layer.provide(DbStub)
      )
    )
  )
})
