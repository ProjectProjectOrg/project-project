import * as BunServices from "@effect/platform-bun/BunServices"
import { it } from "@effect/vitest"
import { Db } from "@pp/db"
import {
  Forbidden,
  GroupColor,
  GroupId,
  type Group,
  ProjectKey,
  TagName,
  TicketId,
  TicketStatus,
  type User,
  UserId
} from "@pp/shared"
import * as Config from "effect/Config"
import * as ConfigProvider from "effect/ConfigProvider"
import * as DateTime from "effect/DateTime"
import * as Effect from "effect/Effect"
import * as FileSystem from "effect/FileSystem"
import * as Layer from "effect/Layer"
import * as Path from "effect/Path"
import * as Schema from "effect/Schema"
import { expect } from "vitest"

import { Attachments, type AttachmentsShape } from "../attachments/Attachments"
import { Comments, type CommentsShape } from "../comments/Comments"
import { FigmaLinks, type FigmaLinksShape } from "../figma/FigmaLinks"
import { GitHub, type GitHubShape } from "../github/GitHub"
import { Groups, type GroupsShape } from "../groups/Groups"
import { Library } from "../library/Library"
import { MarkdownError } from "../markdown/Markdown"
import { MarkdownLive } from "../markdown/MarkdownLive"
import { Projects, type ProjectsShape } from "../projects/Projects"
import { Users, type UsersShape } from "../users/Users"
import { TicketDocs } from "./TicketDocs"
import { TicketDocsLive } from "./TicketDocsLive"
import * as TicketDocumentLock from "./ticketDocumentLock"
import { TicketIndex, type TicketIndexShape } from "./TicketIndex"
import { Tickets } from "./Tickets"
import { TicketsLive } from "./TicketsLive"

const decodeProjectKey = Schema.decodeUnknownSync(ProjectKey)
const decodeTagName = Schema.decodeUnknownSync(TagName)
const decodeStatus = Schema.decodeUnknownSync(TicketStatus)
const decodeGroupId = Schema.decodeUnknownSync(GroupId)
const decodeGroupColor = Schema.decodeUnknownSync(GroupColor)
const decodeTicketId = Schema.decodeUnknownSync(TicketId)
const decodeUserId = Schema.decodeUnknownSync(UserId)

function unexpected(method: string): Effect.Effect<never> {
  return Effect.die(new Error(`unexpected ${method} call`))
}

const ticketIndexProject = {
  orgSlug: "org",
  organizationId: "org-1",
  projectId: "project-1",
  projectSlug: "p"
}

const sprintAssignments: Array<{
  ticketId: string
  sprintId: string | null
}> = []
const sprintAssignmentAnchors: Array<string | null> = []
const sprintMemberships = new Map<string, string>()
const sprintTicketOrders = new Map<string, Array<string>>()
const groupTimestamp = DateTime.toDate(
  DateTime.makeUnsafe("2026-09-13T00:00:00.000Z")
)

let sprintAssignable = true
let failSprintAssignmentAt = Number.POSITIVE_INFINITY
let sprintAssignmentAttempts = 0
let nextTicketNumber = 1
let failUpsertAfter = Number.POSITIVE_INFINITY
let upserts = 0

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
  requireMember: () => Effect.succeed({ role: "developer" as const }),
  requireRole: () => unexpected("Projects.requireRole"),
  addMember: () => unexpected("Projects.addMember"),
  updateMember: () => unexpected("Projects.updateMember"),
  removeMember: () => unexpected("Projects.removeMember"),
  cancelPendingMember: () => unexpected("Projects.cancelPendingMember"),
  unassignUserFromActiveTickets: () =>
    unexpected("Projects.unassignUserFromActiveTickets"),
  connectGithub: () => unexpected("Projects.connectGithub"),
  disconnectGithub: () => unexpected("Projects.disconnectGithub")
} satisfies ProjectsShape)

const FakeGroups = Layer.succeed(Groups, {
  list: () =>
    Effect.sync(() => {
      return [...sprintTicketOrders].map(
        ([sprintId, tickets]): Group => ({
          id: decodeGroupId(sprintId),
          name: sprintId,
          kind: "sprint",
          color: decodeGroupColor("#777777"),
          tickets: tickets.map((ticketId) => decodeTicketId(ticketId)),
          startsAt: null,
          endsAt: null,
          completedAt: null,
          createdBy: "user-1",
          createdAt: groupTimestamp,
          updatedAt: groupTimestamp
        })
      )
    }),
  listPaged: () => unexpected("Groups.listPaged"),
  listSprintsPaged: () => unexpected("Groups.listSprintsPaged"),
  get: () => unexpected("Groups.get"),
  create: () => unexpected("Groups.create"),
  update: () => unexpected("Groups.update"),
  updateTickets: () => unexpected("Groups.updateTickets"),
  addTickets: () => unexpected("Groups.addTickets"),
  removeTickets: () => unexpected("Groups.removeTickets"),
  updateTicketOrder: () => unexpected("Groups.updateTicketOrder"),
  complete: () => unexpected("Groups.complete"),
  remove: () => unexpected("Groups.remove"),
  ensureSprintAssignable: () =>
    Effect.suspend(() => (sprintAssignable ? Effect.void : new Forbidden())),
  setSprintMembership: (_orgSlug, _slug, ticketId, sprintId, options) =>
    Effect.suspend(() => {
      sprintAssignmentAttempts += 1
      if (sprintAssignmentAttempts === failSprintAssignmentAt) {
        return new MarkdownError({
          cause: new Error("sprint write failed"),
          message: "sprint write failed"
        })
      }
      sprintAssignments.push({ ticketId, sprintId })
      sprintAssignmentAnchors.push(options?.after ?? null)
      for (const [id, tickets] of sprintTicketOrders) {
        sprintTicketOrders.set(
          id,
          tickets.filter((candidate) => candidate !== ticketId)
        )
      }
      if (sprintId === null) sprintMemberships.delete(ticketId)
      else {
        sprintMemberships.set(ticketId, sprintId)
        const tickets = sprintTicketOrders.get(sprintId) ?? []
        const anchor =
          options?.after === undefined || options.after === null
            ? -1
            : tickets.indexOf(options.after)
        sprintTicketOrders.set(
          sprintId,
          options?.after === null
            ? [ticketId, ...tickets]
            : anchor >= 0
              ? [
                  ...tickets.slice(0, anchor + 1),
                  ticketId,
                  ...tickets.slice(anchor + 1)
                ]
              : [...tickets, ticketId]
        )
      }
      return Effect.void
    }),
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

const FakeComments = Layer.succeed(Comments, {
  list: () => unexpected("Comments.list"),
  create: () => unexpected("Comments.create"),
  edit: () => unexpected("Comments.edit"),
  remove: () => unexpected("Comments.remove"),
  importHistorical: () => unexpected("Comments.importHistorical")
} satisfies CommentsShape)

const fakeUser = (id: string): User => ({
  id: decodeUserId(id),
  email: `${id}@example.com`,
  name: id,
  username: null,
  image: null,
  createdAt: DateTime.toDate(DateTime.makeUnsafe("2026-01-01T00:00:00.000Z")),
  activeOrgSlug: null,
  personalGithub: { connected: false },
  editorPreference: "github",
  personalEverhour: {
    connected: false,
    everhourUserId: null,
    name: null,
    email: null,
    lastVerifiedAt: null,
    lastCheckError: null
  }
})

const FakeUsers = Layer.succeed(Users, {
  findByEmail: () => unexpected("Users.findByEmail"),
  findManyByIds: () => unexpected("Users.findManyByIds"),
  fullByIds: (ids) => Effect.succeed(ids.map(fakeUser))
} satisfies UsersShape)

const FakeTicketIndex = Layer.succeed(TicketIndex, {
  projectsFor: () => Effect.succeed([]),
  assignedTo: () => Effect.succeed([]),
  touchedBy: () => Effect.succeed([]),
  countAssignedByStatus: () => Effect.succeed([]),
  assignedPerProject: () => Effect.succeed([]),
  projectFor: () => Effect.succeed(ticketIndexProject),
  list: () => Effect.succeed([]),
  query: () => Effect.succeed([]),
  orderKeyFor: () => Effect.succeed(null),
  count: () => Effect.succeed({ total: 0, byStatus: {} }),
  listIds: () => Effect.succeed([]),
  existingIds: () => Effect.succeed(new Set()),
  reserveTicketNumber: () => Effect.sync(() => nextTicketNumber++),
  tagUsageCounts: () => Effect.succeed({}),
  findTicketIdsByTag: () => Effect.succeed([]),
  findTicketIdsByStatus: () => Effect.succeed([]),
  findTicketsByBranch: () => Effect.succeed([]),
  isRepositoryBranchAttached: () => Effect.succeed(false),
  getBranchDeletedAt: () => Effect.succeed(null),
  upsertTicket: () =>
    Effect.suspend(() => {
      upserts += 1
      return upserts > failUpsertAfter
        ? Effect.die(new Error("index write failed"))
        : Effect.void
    }),
  markBranchStale: () => Effect.succeed([]),
  clearBranchStale: () => Effect.void,
  updateBranchChecks: () => Effect.succeed([]),
  deleteTicket: () => Effect.void,
  rebuildProject: () =>
    Effect.succeed({ project: ticketIndexProject, indexed: 0, skipped: 0 }),
  rebuildAllProjects: () => Effect.succeed({ projects: [] }),
  reconcileProject: () =>
    Effect.succeed({
      project: ticketIndexProject,
      drift: { missing: [], orphaned: [], stale: [] },
      rebuilt: false,
      indexed: 0,
      skipped: 0
    }),
  reconcileAllProjects: () => Effect.succeed({ projects: [], reconciled: 0 })
} satisfies TicketIndexShape)

const FakeAttachments = Layer.succeed(Attachments, {
  prepare: () => unexpected("Attachments.prepare"),
  commit: () => unexpected("Attachments.commit"),
  resolveForServing: () => unexpected("Attachments.resolveForServing"),
  reconcileTicket: () => Effect.void,
  orphanProject: () => unexpected("Attachments.orphanProject"),
  listForOrg: () => unexpected("Attachments.listForOrg"),
  summarizeForOrg: () => unexpected("Attachments.summarizeForOrg"),
  deleteForOrg: () => unexpected("Attachments.deleteForOrg"),
  missingIds: () => Effect.succeed([]),
  reapOnce: () => unexpected("Attachments.reapOnce"),
  dedupeOnce: () => unexpected("Attachments.dedupeOnce")
} satisfies AttachmentsShape)

const FakeFigmaLinks = Layer.succeed(FigmaLinks, {
  reconcileTicket: () => Effect.void,
  listForTicket: () => unexpected("FigmaLinks.listForTicket"),
  resolveThumbnailUrl: () => unexpected("FigmaLinks.resolveThumbnailUrl")
} satisfies FigmaLinksShape)

const FakeDb = Layer.succeed(Db, {
  query: {
    projectIndex: { findFirst: () => Effect.succeed({ id: "project-1" }) },
    projectTag: { findMany: () => Effect.succeed([{ name: "ui" }]) },
    projectStatus: {
      findMany: () =>
        Effect.succeed([
          { slug: "todo" },
          { slug: "in_progress" },
          { slug: "done" }
        ])
    }
  }
} as never)

const PassthroughLibrary = Layer.mock(Library, {
  resolveSynced: (_orgSlug, _slug, body) => Effect.succeed(body)
})

const TestLayer = Layer.unwrap(
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem
    const tmpRoot = yield* fs.makeTempDirectoryScoped({
      prefix: "projectproject-split-"
    })
    return TicketsLive.pipe(
      Layer.provide(PassthroughLibrary),
      Layer.provideMerge(TicketDocsLive),
      Layer.provide(FakeAttachments),
      Layer.provide(FakeFigmaLinks),
      Layer.provide(FakeProjects),
      Layer.provide(FakeGroups),
      Layer.provide(FakeComments),
      Layer.provide(FakeUsers),
      Layer.provide(FakeGitHub),
      Layer.provide(FakeTicketIndex),
      Layer.provide(FakeDb),
      Layer.provide(TicketDocumentLock.layer),
      Layer.provide(MarkdownLive),
      Layer.provideMerge(
        ConfigProvider.layer(
          ConfigProvider.fromUnknown({ PROJECTS_DIR: tmpRoot })
        )
      )
    )
  })
).pipe(Layer.provideMerge(BunServices.layer))

const resetFakes = Effect.sync(() => {
  sprintAssignments.length = 0
  sprintAssignmentAnchors.length = 0
  sprintMemberships.clear()
  sprintTicketOrders.clear()
  sprintAssignable = true
  failSprintAssignmentAt = Number.POSITIVE_INFINITY
  sprintAssignmentAttempts = 0
  nextTicketNumber = 1
  upserts = 0
  failUpsertAfter = Number.POSITIVE_INFINITY
})

const ticketFile = (root: string, path: Path.Path, id: string) =>
  path.join(root, "orgs", "org", "projects", "p", "tickets", `${id}.md`)

const result = (
  title: string,
  type: "feat" | "bug" | "chore" | "other",
  assignees: ReadonlyArray<string> = []
) => ({
  title,
  type,
  status: decodeStatus("in_progress"),
  priority: "high" as const,
  sprintId: null,
  assignees
})

const seedOriginal = Effect.gen(function* () {
  const tickets = yield* Tickets
  return yield* tickets.create("org", "user-1", "p", {
    title: "Rework the detail page",
    type: "feat",
    priority: "high",
    status: decodeStatus("in_progress"),
    tags: [decodeTagName("ui")],
    assignees: ["user-1"],
    body: "Frontend and backend can move independently."
  })
})

it.effect("split retains the original and creates the remaining tickets", () =>
  Effect.gen(function* () {
    yield* resetFakes
    const tickets = yield* Tickets
    const docs = yield* TicketDocs
    const original = yield* seedOriginal

    const outcome = yield* tickets.split("org", "user-1", "p", original.id, {
      results: [
        result("Detail page layout", "feat", ["user-1"]),
        result("Sidebar API", "feat"),
        result("View preference migration", "chore")
      ]
    })

    expect(outcome.retained.id).toBe(original.id)
    expect(outcome.retained.title).toBe("Detail page layout")
    expect(outcome.retained.body.trim()).toBe(original.body.trim())
    expect(outcome.created).toHaveLength(2)

    const [first, second] = outcome.created
    expect(first.title).toBe("Sidebar API")
    expect(second.type).toBe("chore")

    for (const created of outcome.created) {
      expect(created.splitFrom).toBe(original.id)
      expect(created.status).toBe("in_progress")
      expect(created.priority).toBe("high")
      expect(created.tags).toEqual(["ui"])
      expect(created.body).toBe(
        `Split from [${original.id}](mention:ticket/${original.id})\n`
      )
      const stored = yield* docs.read("org", "p", created.id)
      expect(stored.branchAutoLinkDisabled).toBe(true)
      expect(stored.branch).toBeNull()
    }

    expect(sprintAssignments).toEqual([
      { ticketId: original.id, sprintId: null },
      ...outcome.created.map((created) => ({
        ticketId: created.id,
        sprintId: null
      }))
    ])
    expect(sprintAssignmentAnchors).toEqual([
      original.id,
      original.id,
      outcome.created[0].id
    ])
  }).pipe(Effect.provide(TestLayer))
)

it.effect("split rejects fewer than two results", () =>
  Effect.gen(function* () {
    yield* resetFakes
    const tickets = yield* Tickets
    const original = yield* seedOriginal

    const attempt = yield* Effect.result(
      tickets.split("org", "user-1", "p", original.id, {
        results: [result("Only one", "feat")]
      })
    )

    expect(attempt._tag).toBe("Failure")
    if (attempt._tag === "Failure") {
      expect(attempt.failure._tag).toBe("Validation")
    }
  }).pipe(Effect.provide(TestLayer))
)

it.effect("split refuses a sprint the caller may not change", () =>
  Effect.gen(function* () {
    yield* resetFakes
    sprintAssignable = false
    const tickets = yield* Tickets
    const fs = yield* FileSystem.FileSystem
    const path = yield* Path.Path
    const root = yield* Config.String("PROJECTS_DIR")
    const original = yield* seedOriginal

    const attempt = yield* Effect.result(
      tickets.split("org", "user-1", "p", original.id, {
        results: [
          {
            ...result("Detail page layout", "feat"),
            sprintId: decodeGroupId("G-1")
          },
          { ...result("Sidebar API", "feat"), sprintId: decodeGroupId("G-1") }
        ]
      })
    )

    expect(attempt._tag).toBe("Failure")
    if (attempt._tag === "Failure") {
      expect(attempt.failure._tag).toBe("Forbidden")
    }
    expect(sprintAssignments).toEqual([])
    expect(yield* fs.exists(ticketFile(root, path, "T-2"))).toBe(false)
  }).pipe(Effect.provide(TestLayer))
)

it.effect("split restores the original when a later write fails", () =>
  Effect.gen(function* () {
    yield* resetFakes
    const tickets = yield* Tickets
    const docs = yield* TicketDocs
    const original = yield* seedOriginal

    failUpsertAfter = upserts + 2

    yield* Effect.exit(
      tickets.split("org", "user-1", "p", original.id, {
        results: [
          result("Detail page layout", "feat"),
          result("Sidebar API", "feat"),
          result("View preference migration", "chore")
        ]
      })
    )

    const restored = yield* docs.read("org", "p", original.id)
    expect(restored.title).toBe(original.title)
    expect(restored.assignees).toEqual(original.assignees)
    expect(restored.branchAutoLinkDisabled).toBeUndefined()
  }).pipe(Effect.provide(TestLayer))
)

it.effect("split removes created tickets when the original update fails", () =>
  Effect.gen(function* () {
    yield* resetFakes
    const tickets = yield* Tickets
    const fs = yield* FileSystem.FileSystem
    const path = yield* Path.Path
    const root = yield* Config.String("PROJECTS_DIR")
    const original = yield* seedOriginal

    failUpsertAfter = upserts + 2

    const outcome = yield* Effect.exit(
      tickets.split("org", "user-1", "p", original.id, {
        results: [
          result("Detail page layout", "feat"),
          result("Sidebar API", "feat"),
          result("View preference migration", "chore")
        ]
      })
    )

    expect(outcome._tag).toBe("Failure")
    expect(yield* fs.exists(ticketFile(root, path, original.id))).toBe(true)
    expect(yield* fs.exists(ticketFile(root, path, "T-2"))).toBe(false)
    expect(yield* fs.exists(ticketFile(root, path, "T-3"))).toBe(false)
  }).pipe(Effect.provide(TestLayer))
)

it.effect(
  "split rolls back ticket and sprint writes when membership fails",
  () =>
    Effect.gen(function* () {
      yield* resetFakes
      const tickets = yield* Tickets
      const docs = yield* TicketDocs
      const fs = yield* FileSystem.FileSystem
      const path = yield* Path.Path
      const root = yield* Config.String("PROJECTS_DIR")
      const original = yield* seedOriginal
      const originalSprintId = decodeGroupId("G-1")
      sprintMemberships.set(original.id, originalSprintId)
      sprintTicketOrders.set(originalSprintId, ["T-10", original.id, "T-9"])
      failSprintAssignmentAt = 2

      const outcome = yield* Effect.result(
        tickets.split("org", "user-1", "p", original.id, {
          results: [
            result("Detail page layout", "feat"),
            { ...result("Sidebar API", "feat"), sprintId: originalSprintId },
            {
              ...result("View preference migration", "chore"),
              sprintId: originalSprintId
            }
          ]
        })
      )

      expect(outcome._tag).toBe("Failure")
      if (outcome._tag === "Failure") {
        expect(outcome.failure._tag).toBe("MarkdownError")
      }
      const restored = yield* docs.read("org", "p", original.id)
      expect(restored.title).toBe(original.title)
      expect(sprintMemberships.get(original.id)).toBe(originalSprintId)
      expect(sprintMemberships.has("T-2")).toBe(false)
      expect(sprintMemberships.has("T-3")).toBe(false)
      expect(sprintTicketOrders.get(originalSprintId)).toEqual([
        "T-10",
        original.id,
        "T-9"
      ])
      expect(yield* fs.exists(ticketFile(root, path, "T-2"))).toBe(false)
      expect(yield* fs.exists(ticketFile(root, path, "T-3"))).toBe(false)
    }).pipe(Effect.provide(TestLayer))
)
