import * as BunServices from "@effect/platform-bun/BunServices"
import { it } from "@effect/vitest"
import { EMPTY_TICKET_RELATIONS } from "@pp/shared"
import { Slug } from "@pp/shared"
import {
  BlockDraft,
  BUILTIN_BLOCKS,
  Conflict,
  formatMentionHref,
  ProjectKey,
  TypeDraft,
  TypeKey,
  TagName,
  TicketStatus,
  type User,
  UserId,
  ProjectScope,
  ActivityActor
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

import { databaseLayer } from "../../test/database"
import { accessLayer, projectScope } from "../access/testing"
import {
  recordingTicketActivity,
  type RecordedActivity
} from "../activity/testing"
import * as Attachments from "../attachments/Attachments"
import * as FigmaLinks from "../figma/FigmaLinks"
import { gitAutomationTestLayer } from "../git/automationTesting"
import * as TicketBranchIndex from "../git/TicketBranchIndex"
import * as GitHub from "../github/GitHub"
import * as ProjectGithub from "../github/ProjectGithub"
import * as Groups from "../groups/Groups"
import * as Library from "../library/Library"
import * as LibraryDocs from "../library/LibraryDocs"
import * as KeyedLock from "../locks/KeyedLock"
import * as Markdown from "../markdown/Markdown"
import { FinishedStatuses } from "../projects/FinishedStatuses"
import * as ProjectDocs from "../projects/ProjectDocs"
import * as ProjectMembers from "../projects/ProjectMembers"
import * as Projects from "../projects/Projects"
import type { SubscriptionIntent } from "../subscriptions/intents"
import * as Users from "../users/Users"
import * as TicketServices from "./layer"
import * as TicketCommands from "./TicketCommands"
import * as TicketDocs from "./TicketDocs"
import * as TicketDocumentLock from "./ticketDocumentLock"
import * as TicketIndex from "./TicketIndex"
import * as TicketQueries from "./TicketQueries"

const decodeProjectKey = Schema.decodeUnknownSync(ProjectKey)

function unexpected(method: string): Effect.Effect<never> {
  return Effect.die(new Error(`unexpected ${method} call`))
}

const FakeProjects = Layer.mergeAll(
  Layer.succeed(Projects.Projects, {
    list: () => unexpected("Projects.list"),
    listPaged: () => unexpected("Projects.listPaged"),
    create: () => unexpected("Projects.create"),
    get: () => unexpected("Projects.get"),
    key: () => Effect.succeed(decodeProjectKey("T")),
    update: () => unexpected("Projects.update"),
    updateSetup: () => unexpected("Projects.updateSetup"),
    remove: () => unexpected("Projects.remove")
  } satisfies Projects.Projects["Service"]),
  Layer.mock(ProjectGithub.ProjectGithub, {
    integrations: () => Effect.succeed([])
  }),
  Layer.mock(ProjectMembers.ProjectMembers, {
    memberIds: () => Effect.succeed(new Set(["user-1", "user-2"]))
  })
)

const FakeGroups = Layer.succeed(Groups.Groups, {
  list: () => Effect.succeed([]),
  listPaged: () => unexpected("Groups.listPaged"),
  listSprintsPaged: () => unexpected("Groups.listSprintsPaged"),
  get: () => unexpected("Groups.get"),
  create: () => unexpected("Groups.create"),
  update: () => unexpected("Groups.update"),
  updateTickets: () => unexpected("Groups.updateTickets"),
  addTickets: () => unexpected("Groups.addTickets"),
  removeTickets: () => unexpected("Groups.removeTickets"),
  complete: () => unexpected("Groups.complete"),
  remove: () => unexpected("Groups.remove"),
  ensureSprintAssignable: () => Effect.void,
  setSprintMembership: () => Effect.void,
  removeTicketFromAllGroups: () => Effect.void
} satisfies Groups.Groups["Service"])

const FakeGitHub = Layer.succeed(GitHub.GitHub, {
  listInstallationRepos: () => unexpected("GitHub.listInstallationRepos"),
  verifyInstallationRepo: () => unexpected("GitHub.verifyInstallationRepo"),
  createBranchAsUser: () => unexpected("GitHub.createBranchAsUser"),
  openPullRequestAsUser: () => unexpected("GitHub.openPullRequestAsUser"),
  fetchInstallationProjectStates: () =>
    unexpected("GitHub.fetchInstallationProjectStates"),
  listInstallationBranches: () => unexpected("GitHub.listInstallationBranches"),
  branchExistsInstallation: () => unexpected("GitHub.branchExistsInstallation")
} satisfies GitHub.GitHub["Service"])

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

const FakeUsers = Layer.succeed(Users.Users, {
  findByEmail: () => unexpected("Users.findByEmail"),
  findManyByIds: () => unexpected("Users.findManyByIds"),
  fullByIds: (ids) => Effect.succeed(ids.map(fakeUser))
} satisfies Users.Users["Service"])

const ticketIndexProject = {
  orgSlug: "org",
  organizationId: "org-1",
  projectId: "project-1",
  slug: "p"
}

const FakeTicketIndex = Layer.sync(TicketIndex.TicketIndex, () => {
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
    querySections: () => Effect.succeed(new Map()),
    neighbors: () => Effect.succeed(null),
    orderKeyFor: () => Effect.succeed(null),
    topRank: () => Effect.succeed(null),
    rankGap: () => Effect.succeed(null),
    count: () => Effect.succeed({ total: 0, byStatus: {} }),
    listIds: () => Effect.succeed([]),
    existingIds: () => Effect.succeed(new Set()),
    mentionableIds: () => Effect.succeed(new Set()),
    movedTo: () => Effect.succeed(null),
    reserveTicketNumber: () => Effect.sync(() => ++reserved),
    tagUsageCounts: () => Effect.succeed({}),
    findTicketIdsByTag: () => Effect.succeed([]),
    findTicketIdsByStatus: () => Effect.succeed([]),
    upsertTicket: () => Effect.void,
    relationsOf: () => Effect.succeed(EMPTY_TICKET_RELATIONS),
    relationEdges: () => Effect.succeed([]),
    deleteTicket: () => Effect.void
  } satisfies TicketIndex.TicketIndex["Service"]
})

const FakeTicketBranchIndex = Layer.succeed(
  TicketBranchIndex.TicketBranchIndex,
  {
    findTicketsByBranch: () => Effect.succeed([]),
    findStackLayers: () => Effect.succeed([]),
    stacksFor: () => Effect.succeed(new Map()),
    findMergesAwaiting: () => Effect.succeed([]),
    isRepositoryBranchAttached: () => Effect.succeed(false),
    getBranchDeletedAt: () => Effect.succeed(null),
    markBranchStale: () => Effect.succeed([]),
    clearBranchStale: () => Effect.void,
    updateBranchChecks: () => Effect.succeed([])
  }
)

const FakeAttachments = Layer.succeed(Attachments.Attachments, {
  prepare: () => unexpected("Attachments.prepare"),
  commit: () => unexpected("Attachments.commit"),
  storeBytes: () => unexpected("Attachments.storeBytes"),
  resolveForServing: () => unexpected("Attachments.resolveForServing"),
  reconcileTicket: () => Effect.void,
  orphanProject: () => unexpected("Attachments.orphanProject"),
  listForOrg: () => unexpected("Attachments.listForOrg"),
  summarizeForOrg: () => unexpected("Attachments.summarizeForOrg"),
  deleteForOrg: () => unexpected("Attachments.deleteForOrg"),
  missingIds: () => Effect.succeed([]),
  reapOnce: () => unexpected("Attachments.reapOnce"),
  dedupeOnce: () => unexpected("Attachments.dedupeOnce")
} satisfies Attachments.Attachments["Service"])

const FakeFigmaLinks = Layer.succeed(FigmaLinks.FigmaLinks, {
  reconcileTicket: () => Effect.void,
  listForTicket: () => unexpected("FigmaLinks.listForTicket"),
  resolveThumbnailUrl: () => unexpected("FigmaLinks.resolveThumbnailUrl")
} satisfies FigmaLinks.FigmaLinks["Service"])

const FakeDb = databaseLayer(({ sql }) =>
  Effect.sync(() => {
    if (sql.includes('from "project_tag"')) return [["frontend"], ["backend"]]
    if (sql.includes('from "project_index"')) return [["project-1"]]
    if (sql.includes('from "project_status"'))
      return [["todo"], ["in_progress"], ["done"]]
    throw new Error(`Unexpected SQL: ${sql}`)
  })
)

const recordedActivity: Array<RecordedActivity> = []
const recordedSubscriptions: Array<SubscriptionIntent> = []

const TestLayer = Layer.unwrap(
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem
    const tmpRoot = yield* fs.makeTempDirectoryScoped({
      prefix: "projectproject-tk-"
    })
    return TicketServices.layer
      .pipe(Layer.provide(gitAutomationTestLayer()))
      .pipe(
        Layer.provideMerge(Library.layer),
        Layer.provideMerge(LibraryDocs.layer),
        Layer.provide(
          Layer.mock(ProjectDocs.ProjectDocs, {
            read: () =>
              Effect.succeed({
                slug: Slug.make("project"),
                name: "Project",
                icon: "P",
                color: "#123456",
                createdAt: DateTime.toDate(
                  DateTime.makeUnsafe("2026-01-01T00:00:00.000Z")
                ),
                github: null,
                githubRepos: [],
                estimation: "points",
                setup: {
                  workflowReviewedAt: null,
                  invitePeopleDismissedAt: null,
                  connectGithubDismissedAt: null
                },
                body: ""
              })
          })
        ),
        Layer.provideMerge(TicketDocs.layer),
        Layer.provideMerge(
          recordingTicketActivity(recordedActivity, recordedSubscriptions)
        ),
        Layer.provideMerge(
          Layer.succeed(ActivityActor, ActivityActor.user("user-1"))
        ),
        Layer.provide(FakeAttachments),
        Layer.provide(FakeFigmaLinks),
        Layer.provide(FakeProjects),
        Layer.provide(FakeGroups),
        Layer.provide(FakeUsers),
        Layer.provide(FakeGitHub),
        Layer.provide(Layer.mergeAll(FakeTicketIndex, FakeTicketBranchIndex)),
        Layer.provide(FakeDb),
        Layer.provide(TicketDocumentLock.layer),
        Layer.provide(
          Layer.mergeAll(KeyedLock.layer, FinishedStatuses.baseline)
        ),
        Layer.provide(accessLayer({})),
        Layer.merge(
          Layer.succeed(
            ProjectScope,
            projectScope("member", "pm", {
              orgSlug: "org",
              slug: "p",
              projectId: "p",
              organizationId: "org"
            })
          )
        ),
        Layer.provide(Markdown.layer),
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
    const tickets = yield* TicketCommands.TicketCommands
    const fs = yield* FileSystem.FileSystem
    const path = yield* Path.Path
    const root = yield* Config.String("PROJECTS_DIR")

    const created = yield* tickets.quickCreate({
      title: "first"
    })
    expect(created.id).toBe("T-1")
    yield* tickets.update(created.id, {
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

    yield* tickets.remove(created.id)

    expect(yield* fs.exists(filePath)).toBe(false)
  }).pipe(Effect.provide(TestLayer))
)

it.effect("honors a custom status on quickCreate", () =>
  Effect.gen(function* () {
    const tickets = yield* TicketCommands.TicketCommands
    const created = yield* tickets.quickCreate({
      title: "in progress at birth",
      status: TicketStatus.make("in_progress")
    })
    expect(created.status).toBe("in_progress")
  }).pipe(Effect.provide(TestLayer))
)

it.effect("falls back to 'todo' when status is omitted on quickCreate", () =>
  Effect.gen(function* () {
    const tickets = yield* TicketCommands.TicketCommands
    const created = yield* tickets.quickCreate({
      title: "no status given"
    })
    expect(created.status).toBe("todo")
  }).pipe(Effect.provide(TestLayer))
)

it.effect("rejects an unknown status on quickCreate", () =>
  Effect.gen(function* () {
    const tickets = yield* TicketCommands.TicketCommands
    const result = yield* Effect.result(
      tickets.quickCreate({
        title: "bogus",
        status: TicketStatus.make("not_a_real_status")
      })
    )
    expect(result).toMatchObject({
      _tag: "Failure",
      failure: { _tag: "Validation" }
    })
  }).pipe(Effect.provide(TestLayer))
)

const archiveChanges = (ticketId: string) =>
  recordedActivity.flatMap((entry) =>
    entry.changes
      .filter(
        (scoped) =>
          scoped.ticketId === ticketId && scoped.change.kind === "archived"
      )
      .map((scoped) => scoped.change)
  )

it.effect("archiving records the trimmed reason on the activity entry", () =>
  Effect.gen(function* () {
    recordedActivity.length = 0
    const tickets = yield* TicketCommands.TicketCommands
    const created = yield* tickets.quickCreate({
      title: "archive me"
    })
    expect(created.archivedAt).toBeNull()

    const archived = yield* tickets.archive(created.id, {
      reason: "  no longer relevant "
    })
    expect(archived.archivedAt).not.toBeNull()
    expect(archiveChanges(created.id)).toEqual([
      { kind: "archived", reason: "no longer relevant" }
    ])

    const docs = yield* TicketDocs.TicketDocs
    const stored = yield* docs.read("org", "p", created.id)
    expect(stored.commentsRegion).not.toContain("no longer relevant")

    const unarchived = yield* tickets.unarchive(created.id)
    expect(unarchived.archivedAt).toBeNull()
  }).pipe(Effect.provide(TestLayer))
)

it.effect(
  "bulk assigning records the change and subscribes the new assignee",
  () =>
    Effect.gen(function* () {
      const tickets = yield* TicketCommands.TicketCommands
      const created = yield* tickets.quickCreate({ title: "bulk assign" })
      recordedActivity.length = 0
      recordedSubscriptions.length = 0

      yield* tickets.bulkUpdate({
        tickets: [created.id],
        patch: { assignees: { add: ["user-2"] } }
      })

      expect(
        recordedActivity.flatMap(({ changes }) =>
          changes.map(({ change }) => change)
        )
      ).toEqual([{ kind: "assignees_changed", added: ["user-2"], removed: [] }])
      expect(
        recordedSubscriptions.map(({ userId, reason }) => ({ userId, reason }))
      ).toEqual([{ userId: "user-2", reason: "assigned" }])
    }).pipe(Effect.provide(TestLayer))
)

it.effect("bulk archive skips tickets that are already archived", () =>
  Effect.gen(function* () {
    const tickets = yield* TicketCommands.TicketCommands
    const first = yield* tickets.quickCreate({ title: "first" })
    const second = yield* tickets.quickCreate({ title: "second" })
    yield* tickets.archive(first.id)

    const result = yield* tickets.bulkArchive({
      tickets: [first.id, second.id]
    })

    expect(result.tickets).toEqual([second.id])
    const stored = yield* (yield* TicketDocs.TicketDocs).read(
      "org",
      "p",
      second.id
    )
    expect(stored.archivedAt).not.toBeNull()
  }).pipe(Effect.provide(TestLayer))
)

it.effect("bulk delete ignores tickets that are already gone", () =>
  Effect.gen(function* () {
    const tickets = yield* TicketCommands.TicketCommands
    const first = yield* tickets.quickCreate({ title: "first" })
    const second = yield* tickets.quickCreate({ title: "second" })
    yield* tickets.remove(first.id)

    yield* tickets.bulkDelete({ tickets: [first.id, second.id] })

    const read = yield* Effect.exit(
      (yield* TicketDocs.TicketDocs).read("org", "p", second.id)
    )
    expect(read._tag).toBe("Failure")
  }).pipe(Effect.provide(TestLayer))
)

it.effect("archiving with a blank reason records no reason", () =>
  Effect.gen(function* () {
    recordedActivity.length = 0
    const tickets = yield* TicketCommands.TicketCommands
    const created = yield* tickets.quickCreate({
      title: "silent archive"
    })
    yield* tickets.archive(created.id, { reason: "   " })
    expect(archiveChanges(created.id)).toEqual([{ kind: "archived" }])
  }).pipe(Effect.provide(TestLayer))
)

it.effect(
  "archiving an archived ticket or restoring an active one conflicts",
  () =>
    Effect.gen(function* () {
      recordedActivity.length = 0
      const tickets = yield* TicketCommands.TicketCommands
      const queries = yield* TicketQueries.TicketQueries
      const created = yield* tickets.quickCreate({ title: "archive twice" })

      const notArchived = yield* Effect.flip(tickets.unarchive(created.id))
      expect(notArchived).toEqual(
        new Conflict({ reason: "ticket_not_archived" })
      )

      const archived = yield* tickets.archive(created.id)
      const again = yield* Effect.flip(
        tickets.archive(created.id, { reason: "late reason" })
      )
      expect(again).toEqual(new Conflict({ reason: "ticket_already_archived" }))
      expect(archiveChanges(created.id)).toEqual([{ kind: "archived" }])
      const stored = yield* queries.get(created.id)
      expect(stored.archivedAt).toEqual(archived.archivedAt)
    }).pipe(Effect.provide(TestLayer))
)

it.effect(
  "creating a ticket after deleting one with the same name does not inherit the old description",
  () =>
    Effect.gen(function* () {
      const tickets = yield* TicketCommands.TicketCommands
      const queries = yield* TicketQueries.TicketQueries

      const original = yield* tickets.quickCreate({
        title: "foo"
      })
      yield* tickets.update(original.id, {
        body: "# foo\n\nold secret description"
      })
      yield* tickets.remove(original.id)

      const reborn = yield* tickets.quickCreate({
        title: "foo"
      })
      const fetched = yield* queries.get(reborn.id)

      expect(fetched.body).not.toContain("old secret description")
      expect(fetched.body.trim()).toBe("")
    }).pipe(Effect.provide(TestLayer))
)

const typeKey = Schema.decodeUnknownSync(TypeKey)
const decodeTypeDraft = Schema.decodeUnknownSync(TypeDraft)
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

const projectType = (overrides: Readonly<Record<string, unknown>>) =>
  decodeTypeDraft({
    key: "incident-lite",
    name: "Incident lite",
    icon: "Siren",
    color: null,
    description: "",
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
    const docs = yield* LibraryDocs.LibraryDocs
    for (const block of BUILTIN_BLOCKS.filter((draft) =>
      keys.includes(draft.key)
    ))
      yield* docs.writeBlock("org", null, block)
  })

it.effect(
  "quickCreate with a type writes its starting description, hints stripped",
  () =>
    Effect.gen(function* () {
      const tickets = yield* TicketCommands.TicketCommands
      const queries = yield* TicketQueries.TicketQueries
      const created = yield* tickets.quickCreate({
        title: "login loops",
        type: typeKey("bug")
      })
      expect(created.type).toBe("bug")
      expect(created.priority).toBe("med")
      expect(created.body).toContain('<block type="expected-vs-actual">')
      expect(created.body).toContain('<block type="definition-of-done" sync>')
      expect(created.body).toContain("**Expected:**")
      expect(created.body).not.toContain("{{")

      const fetched = yield* queries.get(created.id)
      expect(fetched.body).toBe(created.body)
    }).pipe(Effect.provide(TestLayer))
)

it.effect("a ticket without a type is created blank and reads as null", () =>
  Effect.gen(function* () {
    const tickets = yield* TicketCommands.TicketCommands
    const omitted = yield* tickets.quickCreate({ title: "no type" })
    const explicit = yield* tickets.create({ title: "no type", type: null })
    expect(omitted.type).toBeNull()
    expect(omitted.body).toBe("")
    expect(explicit.type).toBeNull()
    expect(explicit.body).toBe("")
    expect(explicit.priority).toBe("med")
  }).pipe(Effect.provide(TestLayer))
)

it.effect(
  "create with a custom type applies its description, priority and tags unless passed",
  () =>
    Effect.gen(function* () {
      yield* adoptAtOrg(["context"])
      yield* (yield* LibraryDocs.LibraryDocs).writeType(
        "org",
        "p",
        projectType({})
      )
      const tickets = yield* TicketCommands.TicketCommands
      const defaults = yield* tickets.create({
        title: "from type",
        type: typeKey("incident-lite")
      })
      expect(defaults.type).toBe("incident-lite")
      expect(defaults.priority).toBe("high")
      expect(defaults.tags).toEqual(["frontend"])
      expect(defaults.body).toContain('<block type="context">')

      const explicit = yield* tickets.create({
        title: "explicit fields",
        type: typeKey("incident-lite"),
        priority: "low",
        tags: [],
        body: "my own body"
      })
      expect(explicit.type).toBe("incident-lite")
      expect(explicit.priority).toBe("low")
      expect(explicit.tags).toEqual([])
      expect(explicit.body).toBe("my own body")
    }).pipe(Effect.provide(TestLayer))
)

it.effect("an unknown type fails with Validation naming the key", () =>
  Effect.gen(function* () {
    const tickets = yield* TicketCommands.TicketCommands
    const existing = yield* tickets.quickCreate({ title: "existing" })
    const reason = "unknown_type:nope"
    expect(
      yield* Effect.flip(
        tickets.quickCreate({ title: "nope", type: typeKey("nope") })
      )
    ).toMatchObject({ _tag: "Validation", reason })
    expect(
      yield* Effect.flip(
        tickets.create({
          title: "nope",
          body: "a body does not skip the check",
          type: typeKey("nope")
        })
      )
    ).toMatchObject({ _tag: "Validation", reason })
    expect(
      yield* Effect.flip(tickets.update(existing.id, { type: typeKey("nope") }))
    ).toMatchObject({ _tag: "Validation", reason })
    expect(
      yield* Effect.flip(
        tickets.bulkUpdate({
          tickets: [existing.id],
          patch: { type: typeKey("nope") }
        })
      )
    ).toMatchObject({ _tag: "Validation", reason })
  }).pipe(Effect.provide(TestLayer))
)

it.effect(
  "a hidden type can't be assigned but stays on tickets that have it",
  () =>
    Effect.gen(function* () {
      const tickets = yield* TicketCommands.TicketCommands
      const typed = yield* tickets.quickCreate({
        title: "typed before hiding",
        type: typeKey("chore")
      })
      const untyped = yield* tickets.quickCreate({ title: "untyped" })
      yield* (yield* LibraryDocs.LibraryDocs).writeTombstone(
        "org",
        "p",
        "types",
        "chore"
      )
      const reason = "unknown_type:chore"

      expect(
        yield* Effect.flip(
          tickets.quickCreate({ title: "new", type: typeKey("chore") })
        )
      ).toMatchObject({ _tag: "Validation", reason })
      expect(
        yield* Effect.flip(
          tickets.update(untyped.id, { type: typeKey("chore") })
        )
      ).toMatchObject({ _tag: "Validation", reason })
      expect(
        yield* Effect.flip(
          tickets.bulkUpdate({
            tickets: [typed.id, untyped.id],
            patch: { type: typeKey("chore") }
          })
        )
      ).toMatchObject({ _tag: "Validation", reason })

      const renamed = yield* tickets.update(typed.id, {
        title: "still a chore",
        type: typeKey("chore")
      })
      expect(renamed.ticket.type).toBe("chore")
      expect(renamed.ticket.title).toBe("still a chore")
      yield* tickets.bulkUpdate({
        tickets: [typed.id],
        patch: { type: typeKey("chore"), priority: "high" }
      })
      expect(
        yield* (yield* TicketDocs.TicketDocs).read("org", "p", typed.id)
      ).toMatchObject({ type: "chore", priority: "high" })
    }).pipe(Effect.provide(TestLayer))
)

it.effect(
  "changing the type replaces only an empty or untouched description",
  () =>
    Effect.gen(function* () {
      const tickets = yield* TicketCommands.TicketCommands
      const empty = yield* tickets.quickCreate({ title: "empty" })
      const untouched = yield* tickets.quickCreate({
        title: "untouched",
        type: typeKey("bug")
      })
      const written = yield* tickets.create({
        title: "written",
        type: typeKey("bug"),
        body: "Steps I wrote myself."
      })

      const filled = yield* tickets.update(empty.id, { type: typeKey("bug") })
      expect(filled.ticket.body).toBe(untouched.body)

      const swapped = yield* tickets.update(untouched.id, {
        type: typeKey("chore")
      })
      expect(swapped.ticket.type).toBe("chore")
      expect(swapped.ticket.body).toContain('<block type="context">')
      expect(swapped.ticket.body).not.toContain("expected-vs-actual")

      const kept = yield* tickets.update(written.id, { type: typeKey("chore") })
      expect(kept.ticket.type).toBe("chore")
      expect(kept.ticket.body.trim()).toBe("Steps I wrote myself.")

      const explicit = yield* tickets.update(empty.id, {
        type: typeKey("feat"),
        body: "Passed along with the type."
      })
      expect(explicit.ticket.body).toBe("Passed along with the type.")

      const cleared = yield* tickets.update(swapped.ticket.id, { type: null })
      expect(cleared.ticket.type).toBeNull()
      expect(cleared.ticket.body.trim()).toBe(swapped.ticket.body.trim())
    }).pipe(Effect.provide(TestLayer))
)

it.effect("bulk edits set a custom type and no type like a single edit", () =>
  Effect.gen(function* () {
    yield* adoptAtOrg(["context"])
    yield* (yield* LibraryDocs.LibraryDocs).writeType(
      "org",
      "p",
      projectType({})
    )
    const tickets = yield* TicketCommands.TicketCommands
    const empty = yield* tickets.quickCreate({ title: "empty" })
    const written = yield* tickets.create({
      title: "written",
      type: typeKey("bug"),
      body: "Steps I wrote myself."
    })
    const ids = [empty.id, written.id]

    const docs = yield* TicketDocs.TicketDocs
    const stored = Effect.forEach(ids, (id) => docs.read("org", "p", id))

    yield* tickets.bulkUpdate({
      tickets: ids,
      patch: { type: typeKey("incident-lite") }
    })
    const custom = yield* stored
    expect(custom.map((ticket) => ticket.type)).toEqual([
      "incident-lite",
      "incident-lite"
    ])
    expect(custom[0].body).toContain('<block type="context">')
    expect(custom[1].body.trim()).toBe("Steps I wrote myself.")

    yield* tickets.bulkUpdate({ tickets: ids, patch: { type: null } })
    expect((yield* stored).map((ticket) => ticket.type)).toEqual([null, null])
  }).pipe(Effect.provide(TestLayer))
)

it.effect(
  "type changes to and from a custom type and no type are recorded",
  () =>
    Effect.gen(function* () {
      yield* (yield* LibraryDocs.LibraryDocs).writeType(
        "org",
        "p",
        projectType({ body: "" })
      )
      const tickets = yield* TicketCommands.TicketCommands
      const created = yield* tickets.quickCreate({ title: "retyped" })
      recordedActivity.length = 0
      yield* tickets.update(created.id, { type: typeKey("incident-lite") })
      yield* tickets.update(created.id, { type: null })

      expect(
        recordedActivity.flatMap((record) =>
          record.changes.flatMap(({ change }) =>
            change.kind === "type_changed" ? [[change.from, change.to]] : []
          )
        )
      ).toEqual([
        [null, "incident-lite"],
        ["incident-lite", null]
      ])
    }).pipe(Effect.provide(TestLayer))
)

it.effect("unresolvable template mentions become plain text on create", () =>
  Effect.gen(function* () {
    yield* (yield* LibraryDocs.LibraryDocs).writeType(
      "org",
      "p",
      projectType({
        body: `Follow up on [T-99](${formatMentionHref("ticket", "T-99")})`
      })
    )
    const tickets = yield* TicketCommands.TicketCommands
    const created = yield* tickets.quickCreate({
      title: "mentions",
      type: typeKey("incident-lite")
    })
    expect(created.body).toBe("Follow up on T-99")
  }).pipe(Effect.provide(TestLayer))
)

it.effect("get resolves synced blocks without rewriting the file", () =>
  Effect.gen(function* () {
    yield* adoptAtOrg(["definition-of-done"])
    const tickets = yield* TicketCommands.TicketCommands
    const queries = yield* TicketQueries.TicketQueries
    const created = yield* tickets.create({
      title: "synced",
      body: SYNCED_DONE
    })
    yield* (yield* LibraryDocs.LibraryDocs).writeBlock(
      "org",
      "p",
      projectDoneBlock
    )

    const fetched = yield* queries.get(created.id)
    expect(fetched.body).toContain("- [x] Reviewed and merged")
    expect(fetched.body).toContain("- [ ] Released")
    expect(fetched.body).not.toContain("Tests cover the change")
    expect(fetched.body).not.toContain("{{")

    const stored = yield* (yield* TicketDocs.TicketDocs).read(
      "org",
      "p",
      created.id
    )
    expect(stored.body).toContain("Tests cover the change")
  }).pipe(Effect.provide(TestLayer))
)

it.effect("update refreshes the stored synced snapshot", () =>
  Effect.gen(function* () {
    const tickets = yield* TicketCommands.TicketCommands
    const created = yield* tickets.quickCreate({
      title: "stale snapshot"
    })
    yield* (yield* LibraryDocs.LibraryDocs).writeBlock(
      "org",
      "p",
      projectDoneBlock
    )
    yield* tickets.update(created.id, {
      body: `Intro\n\n${SYNCED_DONE}`
    })

    const stored = yield* (yield* TicketDocs.TicketDocs).read(
      "org",
      "p",
      created.id
    )
    expect(stored.body).toContain("Intro")
    expect(stored.body).toContain('<block type="definition-of-done" sync>')
    expect(stored.body).toContain("- [x] Reviewed and merged")
    expect(stored.body).toContain("- [ ] Released")
    expect(stored.body).not.toContain("Tests cover the change")
  }).pipe(Effect.provide(TestLayer))
)

const tag = Schema.decodeSync(TagName)

it.effect("concurrent tag adds on one ticket keep both tags", () =>
  Effect.gen(function* () {
    const tickets = yield* TicketCommands.TicketCommands
    const created = yield* tickets.quickCreate({ title: "two taggers" })
    yield* Effect.all(
      [
        tickets.update(created.id, { tags: { add: [tag("frontend")] } }),
        tickets.update(created.id, { tags: { add: [tag("backend")] } })
      ],
      { concurrency: "unbounded", discard: true }
    )
    const stored = yield* (yield* TicketDocs.TicketDocs).read(
      "org",
      "p",
      created.id
    )
    expect(stored.tags.toSorted()).toEqual(["backend", "frontend"])
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
    const tickets = yield* TicketCommands.TicketCommands
    const queries = yield* TicketQueries.TicketQueries
    const created = yield* tickets.quickCreate({
      title: "plain"
    })
    const updated = yield* tickets.update(created.id, {
      body
    })

    const stored = yield* (yield* TicketDocs.TicketDocs).read(
      "org",
      "p",
      created.id
    )
    const fetched = yield* queries.get(created.id)
    expect(updated.ticket.body).toBe(body)
    expect(fetched.body).toBe(stored.body)
  }).pipe(Effect.provide(TestLayer))
)
