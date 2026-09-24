import * as BunServices from "@effect/platform-bun/BunServices"
import { it } from "@effect/vitest"
import { Db } from "@pp/db"
import {
  BlockDraft,
  BUILTIN_BLOCKS,
  BUILTIN_TEMPLATE_DEFAULTS,
  BUILTIN_TEMPLATES,
  formatMentionHref,
  ProjectKey,
  TemplateDraft,
  TemplateKey,
  type TicketStatus,
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
import {
  parseCommentsRegion,
  serializeCommentsRegion
} from "../comments/comments-region"
import { FigmaLinks, type FigmaLinksShape } from "../figma/FigmaLinks"
import { GitHub, type GitHubShape } from "../github/GitHub"
import { Groups, type GroupsShape } from "../groups/Groups"
import { LibraryDocs } from "../library/LibraryDocs"
import { LibraryDocsLive } from "../library/LibraryDocsLive"
import { LibraryLive } from "../library/LibraryLive"
import { Markdown } from "../markdown/Markdown"
import { MarkdownLive } from "../markdown/MarkdownLive"
import { CurrentOrg } from "../organizations/CurrentOrg"
import { ProjectDocs } from "../projects/ProjectDocs"
import { Projects, type ProjectsShape } from "../projects/Projects"
import { Users, type UsersShape } from "../users/Users"
import { TicketDocs } from "./TicketDocs"
import { TicketDocsLive } from "./TicketDocsLive"
import * as TicketDocumentLock from "./ticketDocumentLock"
import { TicketIndex, type TicketIndexShape } from "./TicketIndex"
import { Tickets } from "./Tickets"
import { TicketsLive } from "./TicketsLive"

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
  removeTickets: () => unexpected("Groups.removeTickets"),
  updateTicketOrder: () => unexpected("Groups.updateTicketOrder"),
  complete: () => unexpected("Groups.complete"),
  remove: () => unexpected("Groups.remove"),
  ensureSprintAssignable: () => Effect.void,
  setSprintMembership: () => Effect.void,
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

const decodeUserId = Schema.decodeUnknownSync(UserId)

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

const recordedCommentBodies: Array<string> = []

const FakeComments = Layer.effect(
  Comments,
  Effect.gen(function* () {
    const markdown = yield* Markdown
    return {
      list: () => unexpected("Comments.list"),
      create: (orgSlug, _userId, slug, ticketId, input) =>
        Effect.gen(function* () {
          recordedCommentBodies.push(input.body)
          const file = yield* markdown.readTicketParts(orgSlug, slug, ticketId)
          yield* markdown.writeTicketWithRegion(
            orgSlug,
            slug,
            ticketId,
            file.data,
            file.description,
            serializeCommentsRegion([
              ...parseCommentsRegion(file.region),
              {
                id: `comment-${recordedCommentBodies.length}`,
                author: { kind: "user", userId: "user-1" },
                origin: "native",
                createdAt: DateTime.toDate(
                  DateTime.makeUnsafe("2026-01-01T00:00:00.000Z")
                ),
                editedAt: null,
                body: input.body
              }
            ])
          )
          return {} as never
        }).pipe(Effect.orDie),
      edit: () => unexpected("Comments.edit"),
      importHistorical: () => unexpected("Comments.importHistorical"),
      remove: () => unexpected("Comments.remove")
    } satisfies CommentsShape
  })
)

const ticketIndexProject = {
  orgSlug: "org",
  organizationId: "org-1",
  projectId: "project-1",
  projectSlug: "p"
}

const FakeTicketIndex = Layer.sync(TicketIndex, () => {
  let reserved = 0
  return {
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
    reserveTicketNumber: () => Effect.sync(() => ++reserved),
    tagUsageCounts: () => Effect.succeed({}),
    findTicketIdsByTag: () => Effect.succeed([]),
    findTicketIdsByStatus: () => Effect.succeed([]),
    findTicketsByBranch: () => Effect.succeed([]),
    isRepositoryBranchAttached: () => Effect.succeed(false),
    getBranchDeletedAt: () => Effect.succeed(null),
    upsertTicket: () => Effect.void,
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
  } satisfies TicketIndexShape
})

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
    projectIndex: {
      findFirst: () => Effect.succeed({ id: "project-1" })
    },
    projectTag: {
      findMany: () => Effect.succeed([{ name: "frontend" }])
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
} as never)

const TestLayer = Layer.unwrap(
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem
    const tmpRoot = yield* fs.makeTempDirectoryScoped({
      prefix: "projectproject-tk-"
    })
    return TicketsLive.pipe(
      Layer.provideMerge(LibraryLive),
      Layer.provideMerge(LibraryDocsLive),
      Layer.provide(
        Layer.mock(ProjectDocs, {
          read: () => Effect.succeed({ templateDefaults: {} } as never)
        })
      ),
      Layer.provide(Layer.mock(CurrentOrg, {})),
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

it.effect("deleting a ticket removes its markdown file from disk", () =>
  Effect.gen(function* () {
    const tickets = yield* Tickets
    const fs = yield* FileSystem.FileSystem
    const path = yield* Path.Path
    const root = yield* Config.String("PROJECTS_DIR")

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

it.effect("honors a custom status on quickCreate", () =>
  Effect.gen(function* () {
    const tickets = yield* Tickets
    const created = yield* tickets.quickCreate("org", "user-1", "p", {
      title: "in progress at birth",
      status: "in_progress" as TicketStatus
    })
    expect(created.status).toBe("in_progress")
  }).pipe(Effect.provide(TestLayer))
)

it.effect("falls back to 'todo' when status is omitted on quickCreate", () =>
  Effect.gen(function* () {
    const tickets = yield* Tickets
    const created = yield* tickets.quickCreate("org", "user-1", "p", {
      title: "no status given"
    })
    expect(created.status).toBe("todo")
  }).pipe(Effect.provide(TestLayer))
)

it.effect("rejects an unknown status on quickCreate", () =>
  Effect.gen(function* () {
    const tickets = yield* Tickets
    const result = yield* Effect.result(
      tickets.quickCreate("org", "user-1", "p", {
        title: "bogus",
        status: "not_a_real_status" as never
      })
    )
    expect(result._tag).toBe("Failure")
    if (result._tag === "Failure") {
      expect(result.failure._tag).toBe("Validation")
    }
  }).pipe(Effect.provide(TestLayer))
)

it.effect("archiving sets archivedAt and records the reason as a comment", () =>
  Effect.gen(function* () {
    recordedCommentBodies.length = 0
    const tickets = yield* Tickets
    const created = yield* tickets.quickCreate("org", "user-1", "p", {
      title: "archive me"
    })
    expect(created.archivedAt).toBeNull()

    const archived = yield* tickets.archive(
      "org",
      "user-1",
      "p",
      created.id,
      "no longer relevant"
    )
    expect(archived.archivedAt).not.toBeNull()
    expect(recordedCommentBodies).toEqual(["no longer relevant"])

    const docs = yield* TicketDocs
    const stored = yield* docs.read("org", "p", created.id)
    expect(stored.commentsRegion).toContain("no longer relevant")

    const unarchived = yield* tickets.unarchive(
      "org",
      "user-1",
      "p",
      created.id
    )
    expect(unarchived.archivedAt).toBeNull()
  }).pipe(Effect.provide(TestLayer))
)

it.effect("archiving without a reason posts no comment", () =>
  Effect.gen(function* () {
    recordedCommentBodies.length = 0
    const tickets = yield* Tickets
    const created = yield* tickets.quickCreate("org", "user-1", "p", {
      title: "silent archive"
    })
    yield* tickets.archive("org", "user-1", "p", created.id, "   ")
    expect(recordedCommentBodies).toEqual([])
  }).pipe(Effect.provide(TestLayer))
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
      expect(fetched.body.trim()).toBe("")
    }).pipe(Effect.provide(TestLayer))
)

const templateKey = Schema.decodeUnknownSync(TemplateKey)
const decodeTemplateDraft = Schema.decodeUnknownSync(TemplateDraft)
const decodeBlockDraft = Schema.decodeUnknownSync(BlockDraft)

const SYNCED_DONE = [
  '<block type="definition-of-done" sync>',
  "",
  "## Definition of done",
  "",
  "- [x] Reviewed and merged",
  "- [ ] Tests cover the change",
  "",
  "</block>"
].join("\n")

const projectTemplate = (overrides: Readonly<Record<string, unknown>>) =>
  decodeTemplateDraft({
    key: "incident-lite",
    name: "Incident lite",
    icon: "Siren",
    color: null,
    description: "",
    type: "bug",
    priority: "high",
    tags: ["frontend", "ghost"],
    body: '<block type="context">\n\n</block>',
    ...overrides
  })

const projectDoneBlock = decodeBlockDraft({
  key: "definition-of-done",
  name: "Definition of done",
  icon: "CircleCheckBig",
  color: null,
  description: "",
  sync: true,
  content: [
    "## Definition of done",
    "",
    "- [ ] Reviewed and merged",
    "- [ ] Released {{where it ships}}"
  ].join("\n")
})

const adoptAtOrg = (keys: ReadonlyArray<string>) =>
  Effect.gen(function* () {
    const docs = yield* LibraryDocs
    for (const block of BUILTIN_BLOCKS.filter((draft) =>
      keys.includes(draft.key)
    ))
      yield* docs.writeBlock("org", null, block)
    for (const template of BUILTIN_TEMPLATES.filter((draft) =>
      keys.includes(draft.key)
    ))
      yield* docs.writeTemplate("org", null, template)
    yield* docs.writeOrgDefaults(
      "org",
      Object.fromEntries(
        Object.entries(BUILTIN_TEMPLATE_DEFAULTS).filter(
          ([, key]) => key !== null && keys.includes(key)
        )
      )
    )
  })

const BUG_REPORT_KIT = [
  "bug-report",
  "expected-vs-actual",
  "steps-to-reproduce",
  "environment",
  "definition-of-done"
]

it.effect("quickCreate with a template writes its expanded body and type", () =>
  Effect.gen(function* () {
    yield* adoptAtOrg(BUG_REPORT_KIT)
    const tickets = yield* Tickets
    const created = yield* tickets.quickCreate("org", "user-1", "p", {
      title: "login loops",
      template: templateKey("bug-report")
    })
    expect(created.type).toBe("bug")
    expect(created.priority).toBe("med")
    expect(created.body).toContain('<block type="expected-vs-actual">')
    expect(created.body).toContain('<block type="definition-of-done" sync>')
    expect(created.body).toContain("**Expected:**")
    expect(created.body).not.toContain("{{")

    const fetched = yield* tickets.get("org", "user-1", "p", created.id)
    expect(fetched.body).toBe(created.body)
  }).pipe(Effect.provide(TestLayer))
)

it.effect("quickCreate keeps an explicit type over the template's", () =>
  Effect.gen(function* () {
    yield* adoptAtOrg(BUG_REPORT_KIT)
    const tickets = yield* Tickets
    const created = yield* tickets.quickCreate("org", "user-1", "p", {
      title: "typed",
      type: "chore",
      template: templateKey("bug-report")
    })
    expect(created.type).toBe("chore")
    expect(created.body).toContain('<block type="expected-vs-actual">')
  }).pipe(Effect.provide(TestLayer))
)

it.effect("no template or a null template creates a blank ticket", () =>
  Effect.gen(function* () {
    const tickets = yield* Tickets
    const omitted = yield* tickets.quickCreate("org", "user-1", "p", {
      title: "bug without template",
      type: "bug"
    })
    const blank = yield* tickets.create("org", "user-1", "p", {
      title: "explicit blank",
      type: "feat",
      template: null
    })
    expect(omitted.body).toBe("")
    expect(blank.body).toBe("")
    expect(blank.type).toBe("feat")
  }).pipe(Effect.provide(TestLayer))
)

it.effect("create lets explicit fields win and filters template tags", () =>
  Effect.gen(function* () {
    yield* adoptAtOrg(["context"])
    yield* (yield* LibraryDocs).writeTemplate("org", "p", projectTemplate({}))
    const tickets = yield* Tickets
    const defaults = yield* tickets.create("org", "user-1", "p", {
      title: "from template",
      template: templateKey("incident-lite")
    })
    expect(defaults.type).toBe("other")
    expect(defaults.priority).toBe("high")
    expect(defaults.tags).toEqual(["frontend"])
    expect(defaults.body).toContain('<block type="context">')

    const explicit = yield* tickets.create("org", "user-1", "p", {
      title: "explicit fields",
      type: "chore",
      priority: "low",
      tags: [],
      body: "my own body",
      template: templateKey("incident-lite")
    })
    expect(explicit.type).toBe("chore")
    expect(explicit.priority).toBe("low")
    expect(explicit.tags).toEqual([])
    expect(explicit.body).toBe("my own body")
  }).pipe(Effect.provide(TestLayer))
)

it.effect("an unknown template fails with Validation", () =>
  Effect.gen(function* () {
    const tickets = yield* Tickets
    const quick = yield* Effect.flip(
      tickets.quickCreate("org", "user-1", "p", {
        title: "nope",
        template: templateKey("nope")
      })
    )
    const full = yield* Effect.flip(
      tickets.create("org", "user-1", "p", {
        title: "nope",
        body: "body wins but the key is still checked",
        template: templateKey("nope")
      })
    )
    expect(quick).toMatchObject({
      _tag: "Validation",
      reason: "unknown_template:nope"
    })
    expect(full).toMatchObject({
      _tag: "Validation",
      reason: "unknown_template:nope"
    })
  }).pipe(Effect.provide(TestLayer))
)

it.effect("unresolvable template mentions become plain text on create", () =>
  Effect.gen(function* () {
    yield* (yield* LibraryDocs).writeTemplate(
      "org",
      "p",
      projectTemplate({
        body: `Follow up on [T-99](${formatMentionHref("ticket", "T-99")})`
      })
    )
    const tickets = yield* Tickets
    const created = yield* tickets.quickCreate("org", "user-1", "p", {
      title: "mentions",
      template: templateKey("incident-lite")
    })
    expect(created.body).toBe("Follow up on T-99")
  }).pipe(Effect.provide(TestLayer))
)

it.effect("get resolves synced blocks without rewriting the file", () =>
  Effect.gen(function* () {
    yield* adoptAtOrg(["definition-of-done"])
    const tickets = yield* Tickets
    const created = yield* tickets.create("org", "user-1", "p", {
      title: "synced",
      body: SYNCED_DONE
    })
    yield* (yield* LibraryDocs).writeBlock("org", "p", projectDoneBlock)

    const fetched = yield* tickets.get("org", "user-1", "p", created.id)
    expect(fetched.body).toContain("- [x] Reviewed and merged")
    expect(fetched.body).toContain("- [ ] Released")
    expect(fetched.body).not.toContain("Tests cover the change")
    expect(fetched.body).not.toContain("{{")

    const stored = yield* (yield* TicketDocs).read("org", "p", created.id)
    expect(stored.body).toContain("Tests cover the change")
  }).pipe(Effect.provide(TestLayer))
)

it.effect("update refreshes the stored synced snapshot", () =>
  Effect.gen(function* () {
    const tickets = yield* Tickets
    const created = yield* tickets.quickCreate("org", "user-1", "p", {
      title: "stale snapshot"
    })
    yield* (yield* LibraryDocs).writeBlock("org", "p", projectDoneBlock)
    yield* tickets.update("org", "user-1", "p", created.id, {
      body: `Intro\n\n${SYNCED_DONE}`
    })

    const stored = yield* (yield* TicketDocs).read("org", "p", created.id)
    expect(stored.body).toContain("Intro")
    expect(stored.body).toContain('<block type="definition-of-done" sync>')
    expect(stored.body).toContain("- [x] Reviewed and merged")
    expect(stored.body).toContain("- [ ] Released")
    expect(stored.body).not.toContain("Tests cover the change")
  }).pipe(Effect.provide(TestLayer))
)

it.effect("a body without synced blocks is stored and read byte for byte", () =>
  Effect.gen(function* () {
    const body = [
      "  Indented   text  ",
      "",
      '<block type="context">',
      "",
      "## Context",
      "",
      "- [ ] ",
      "",
      "</block>",
      "",
      "",
      "trailing *md*"
    ].join("\n")
    const tickets = yield* Tickets
    const created = yield* tickets.quickCreate("org", "user-1", "p", {
      title: "plain"
    })
    const updated = yield* tickets.update("org", "user-1", "p", created.id, {
      body
    })

    const stored = yield* (yield* TicketDocs).read("org", "p", created.id)
    const fetched = yield* tickets.get("org", "user-1", "p", created.id)
    expect(updated.ticket.body).toBe(body)
    expect(fetched.body).toBe(stored.body)
  }).pipe(Effect.provide(TestLayer))
)
