import { FileSystem, Path } from "@effect/platform"
import { BunContext } from "@effect/platform-bun"
import { it } from "@effect/vitest"
import * as Config from "effect/Config"
import * as ConfigProvider from "effect/ConfigProvider"
import * as Effect from "effect/Effect"
import * as Layer from "effect/Layer"
import * as Schema from "effect/Schema"
import { expect } from "vitest"
import { ProjectKey, type TicketStatus } from "@projectproject/shared"
import { Db } from "../Services/Db"
import { GitHub, type GitHubShape } from "../Services/GitHub"
import { Groups, type GroupsShape } from "../Services/Groups"
import { Projects, type ProjectsShape } from "../Services/Projects"
import { TicketIndex, type TicketIndexShape } from "../Services/TicketIndex"
import { Tickets } from "../Services/Tickets"
import { MarkdownLive } from "./Markdown"
import { TicketDocsLive } from "./TicketDocs"
import { TicketsLive } from "./Tickets"

const decodeProjectKey = Schema.decodeUnknownSync(ProjectKey)

function unexpected(method: string): Effect.Effect<never> {
  return Effect.die(new Error(`unexpected ${method} call`))
}

const FakeProjects = Layer.succeed(Projects, {
  list: () => unexpected("Projects.list"),
  listPaged: () => unexpected("Projects.listPaged"),
  listMembersPaged: () => unexpected("Projects.listMembersPaged"),
  create: () => unexpected("Projects.create"),
  get: () => unexpected("Projects.get"),
  getKey: () => Effect.succeed(decodeProjectKey("T")),
  getGithubIntegration: () => Effect.succeed(null),
  update: () => unexpected("Projects.update"),
  updateSetup: () => unexpected("Projects.updateSetup"),
  remove: () => unexpected("Projects.remove"),
  requireMember: () => Effect.succeed({ role: "member" as const }),
  requireRole: () => unexpected("Projects.requireRole"),
  addMember: () => unexpected("Projects.addMember"),
  updateMember: () => unexpected("Projects.updateMember"),
  transferOwnership: () => unexpected("Projects.transferOwnership"),
  removeMember: () => unexpected("Projects.removeMember"),
  cancelPendingMember: () => unexpected("Projects.cancelPendingMember"),
  unassignUserFromActiveTickets: () =>
    unexpected("Projects.unassignUserFromActiveTickets"),
  connectGithub: () => unexpected("Projects.connectGithub"),
  disconnectGithub: () => unexpected("Projects.disconnectGithub")
} satisfies ProjectsShape)

const FakeGroups = Layer.succeed(Groups, {
  list: () => unexpected("Groups.list"),
  listPaged: () => unexpected("Groups.listPaged"),
  listSprintsPaged: () => unexpected("Groups.listSprintsPaged"),
  get: () => unexpected("Groups.get"),
  create: () => unexpected("Groups.create"),
  update: () => unexpected("Groups.update"),
  updateTickets: () => unexpected("Groups.updateTickets"),
  addTickets: () => unexpected("Groups.addTickets"),
  updateTicketOrder: () => unexpected("Groups.updateTicketOrder"),
  complete: () => unexpected("Groups.complete"),
  remove: () => unexpected("Groups.remove"),
  removeTicketFromAllGroups: () => Effect.void
} satisfies GroupsShape)

const FakeGitHub = Layer.succeed(GitHub, {
  getInstallationAccount: () => unexpected("GitHub.getInstallationAccount"),
  listInstallationRepos: () => unexpected("GitHub.listInstallationRepos"),
  verifyInstallationRepo: () => unexpected("GitHub.verifyInstallationRepo"),
  exchangeAppUserCode: () => unexpected("GitHub.exchangeAppUserCode"),
  appUserCanAccessInstallation: () =>
    unexpected("GitHub.appUserCanAccessInstallation"),
  createBranchAsUser: () => unexpected("GitHub.createBranchAsUser"),
  openPullRequestAsUser: () => unexpected("GitHub.openPullRequestAsUser"),
  fetchInstallationProjectStates: () =>
    unexpected("GitHub.fetchInstallationProjectStates"),
  listInstallationBranches: () => unexpected("GitHub.listInstallationBranches"),
  branchExistsInstallation: () => unexpected("GitHub.branchExistsInstallation")
} satisfies GitHubShape)

const ticketIndexProject = {
  orgSlug: "org",
  organizationId: "org-1",
  projectId: "project-1",
  projectSlug: "p"
}

const FakeTicketIndex = Layer.succeed(TicketIndex, {
  projectFor: () => Effect.succeed(ticketIndexProject),
  list: () => Effect.succeed([]),
  listIds: () => Effect.succeed([]),
  tagUsageCounts: () => Effect.succeed({}),
  findTicketIdsByTag: () => Effect.succeed([]),
  findTicketIdsByStatus: () => Effect.succeed([]),
  findTicketsByBranch: () => Effect.succeed([]),
  upsertTicket: () => Effect.void,
  deleteTicket: () => Effect.void,
  rebuildProject: () =>
    Effect.succeed({ project: ticketIndexProject, indexed: 0, skipped: 0 }),
  rebuildAllProjects: () => Effect.succeed({ projects: [] })
} satisfies TicketIndexShape)

const FakeDb = Layer.succeed(
  Db,
  {
    query: {
      projectIndex: {
        findFirst: () => Effect.succeed({ id: "project-1" })
      },
      projectStatus: {
        findMany: () =>
          Effect.succeed([
            { slug: "todo" },
            { slug: "in_progress" },
            { slug: "done" }
          ])
      }
    }
  } as never
)

const TestLayer = Layer.unwrapScoped(
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem
    const tmpRoot = yield* fs.makeTempDirectoryScoped({
      prefix: "projectproject-tk-"
    })
    return TicketsLive.pipe(
      Layer.provide(TicketDocsLive),
      Layer.provide(FakeProjects),
      Layer.provide(FakeGroups),
      Layer.provide(FakeGitHub),
      Layer.provide(FakeTicketIndex),
      Layer.provide(FakeDb),
      Layer.provide(MarkdownLive),
      Layer.provideMerge(
        Layer.setConfigProvider(
          ConfigProvider.fromMap(new Map([["PROJECTS_DIR", tmpRoot]]))
        )
      )
    )
  })
).pipe(Layer.provideMerge(BunContext.layer))

it.scoped("deleting a ticket removes its markdown file from disk", () =>
  Effect.gen(function* () {
    const tickets = yield* Tickets
    const fs = yield* FileSystem.FileSystem
    const path = yield* Path.Path
    const root = yield* Config.string("PROJECTS_DIR")

    const created = yield* tickets.quickCreate("org", "user-1", "p", {
      title: "first"
    })
    expect(created.id).toBe("T-1")
    yield* tickets.update("org", "user-1", "p", created.id, {
      body: "# first\n\nimportant context only this ticket should know."
    })

    const filePath = path.join(
      root,
      "orgs",
      "org",
      "projects",
      "p",
      "tickets",
      "T-1.md"
    )
    expect(yield* fs.exists(filePath)).toBe(true)

    yield* tickets.remove("org", "user-1", "p", created.id)

    expect(yield* fs.exists(filePath)).toBe(false)
  }).pipe(Effect.provide(TestLayer))
)

it.scoped("honors a custom status on quickCreate", () =>
  Effect.gen(function* () {
    const tickets = yield* Tickets
    const created = yield* tickets.quickCreate("org", "user-1", "p", {
      title: "in progress at birth",
      status: "in_progress" as TicketStatus
    })
    expect(created.status).toBe("in_progress")
  }).pipe(Effect.provide(TestLayer))
)

it.scoped("falls back to 'todo' when status is omitted on quickCreate", () =>
  Effect.gen(function* () {
    const tickets = yield* Tickets
    const created = yield* tickets.quickCreate("org", "user-1", "p", {
      title: "no status given"
    })
    expect(created.status).toBe("todo")
  }).pipe(Effect.provide(TestLayer))
)

it.scoped("rejects an unknown status on quickCreate", () =>
  Effect.gen(function* () {
    const tickets = yield* Tickets
    const result = yield* Effect.either(
      tickets.quickCreate("org", "user-1", "p", {
        title: "bogus",
        status: "not_a_real_status" as never
      })
    )
    expect(result._tag).toBe("Left")
    if (result._tag === "Left") {
      expect(result.left._tag).toBe("Validation")
    }
  }).pipe(Effect.provide(TestLayer))
)

it.scoped(
  "creating a ticket after deleting one with the same name does not inherit the old description",
  () =>
    Effect.gen(function* () {
      const tickets = yield* Tickets

      const original = yield* tickets.quickCreate("org", "user-1", "p", {
        title: "foo"
      })
      yield* tickets.update("org", "user-1", "p", original.id, {
        body: "# foo\n\nold secret description"
      })
      yield* tickets.remove("org", "user-1", "p", original.id)

      const reborn = yield* tickets.quickCreate("org", "user-1", "p", {
        title: "foo"
      })
      const fetched = yield* tickets.get("org", "user-1", "p", reborn.id)

      expect(fetched.body).not.toContain("old secret description")
      expect(fetched.body).toBe("# foo\n")
    }).pipe(Effect.provide(TestLayer))
)
