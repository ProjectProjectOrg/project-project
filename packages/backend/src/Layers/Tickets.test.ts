import { BunContext } from "@effect/platform-bun"
import { it } from "@effect/vitest"
import * as ConfigProvider from "effect/ConfigProvider"
import * as Effect from "effect/Effect"
import * as Layer from "effect/Layer"
// @effect-diagnostics-next-line nodeBuiltinImport:off
import * as fsp from "node:fs/promises"
import * as os from "node:os"
// @effect-diagnostics-next-line nodeBuiltinImport:off
import * as path from "node:path"
import { afterEach, beforeEach, expect } from "vitest"
import { ProjectKey } from "@projectproject/shared"
import * as Schema from "effect/Schema"
import { Db } from "../Services/Db"
import { GitHub, type GitHubShape } from "../Services/GitHub"
import { Groups, type GroupsShape } from "../Services/Groups"
import { Projects, type ProjectsShape } from "../Services/Projects"
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
  listUserRepos: () => unexpected("GitHub.listUserRepos"),
  verifyAccess: () => unexpected("GitHub.verifyAccess"),
  createBranch: () => unexpected("GitHub.createBranch"),
  openPullRequest: () => unexpected("GitHub.openPullRequest"),
  fetchProjectStates: () => unexpected("GitHub.fetchProjectStates"),
  listBranches: () => unexpected("GitHub.listBranches"),
  branchExists: () => unexpected("GitHub.branchExists")
} satisfies GitHubShape)

const FakeDb = Layer.succeed(
  Db,
  new Proxy(
    {},
    {
      get:
        (_target, prop) =>
        (..._args: ReadonlyArray<unknown>) =>
          unexpected(`Db.${String(prop)}`)
    }
  ) as never
)

let tmpRoot = ""

beforeEach(async () => {
  tmpRoot = await fsp.mkdtemp(path.join(os.tmpdir(), "projectproject-tk-"))
})

afterEach(async () => {
  await fsp.rm(tmpRoot, { recursive: true, force: true })
})

const liveLayer = () =>
  TicketsLive.pipe(
    Layer.provide(TicketDocsLive),
    Layer.provide(FakeProjects),
    Layer.provide(FakeGroups),
    Layer.provide(FakeGitHub),
    Layer.provide(FakeDb),
    Layer.provide(MarkdownLive),
    Layer.provide(BunContext.layer),
    Layer.provideMerge(
      Layer.setConfigProvider(
        ConfigProvider.fromMap(new Map([["PROJECTS_DIR", tmpRoot]]))
      )
    )
  )

it.effect(
  "deleting a ticket removes its markdown file from disk",
  () =>
    Effect.gen(function* () {
      const tickets = yield* Tickets
      const created = yield* tickets.quickCreate("org", "user-1", "p", {
        title: "first"
      })
      expect(created.id).toBe("T-1")
      yield* tickets.update("org", "user-1", "p", created.id, {
        body: "# first\n\nimportant context only this ticket should know."
      })

      const filePath = path.join(
        tmpRoot,
        "orgs",
        "org",
        "projects",
        "p",
        "tickets",
        "T-1.md"
      )
      const existsBefore = yield* Effect.promise(() =>
        fsp
          .stat(filePath)
          .then(() => true)
          .catch(() => false)
      )
      expect(existsBefore).toBe(true)

      yield* tickets.remove("org", "user-1", "p", created.id)

      const existsAfter = yield* Effect.promise(() =>
        fsp
          .stat(filePath)
          .then(() => true)
          .catch(() => false)
      )
      expect(existsAfter).toBe(false)
    }).pipe(Effect.provide(liveLayer()))
)

it.effect(
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
    }).pipe(Effect.provide(liveLayer()))
)
