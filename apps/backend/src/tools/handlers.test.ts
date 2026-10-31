import { describe, expect, it } from "@effect/vitest"
import { Access } from "@pp/server-core/access/Access"
import {
  orgScope,
  projectScope,
  testUser
} from "@pp/server-core/access/testing"
import * as AttachmentUploads from "@pp/server-core/attachments/AttachmentUploads"
import { BetterAuth } from "@pp/server-core/auth/BetterAuth"
import { Comments } from "@pp/server-core/comments/Comments"
import { GroupDocs } from "@pp/server-core/groups/GroupDocs"
import { Groups } from "@pp/server-core/groups/Groups"
import { Library } from "@pp/server-core/library/Library"
import { ProjectDocs } from "@pp/server-core/projects/ProjectDocs"
import { ProjectGitAutomation } from "@pp/server-core/projects/ProjectGitAutomation"
import { Projects } from "@pp/server-core/projects/Projects"
import { ProjectStatuses } from "@pp/server-core/projects/ProjectStatuses"
import * as OrgStorage from "@pp/server-core/storage/OrgStorage"
import { Tags } from "@pp/server-core/tags/Tags"
import * as TicketCommands from "@pp/server-core/tickets/TicketCommands"
import { TicketDocs } from "@pp/server-core/tickets/TicketDocs"
import * as TicketGit from "@pp/server-core/tickets/TicketGit"
import { TicketIndex } from "@pp/server-core/tickets/TicketIndex"
import * as TicketIndexMaintenance from "@pp/server-core/tickets/TicketIndexMaintenance"
import type { TicketProject } from "@pp/server-core/tickets/ticketProject"
import * as TicketQueries from "@pp/server-core/tickets/TicketQueries"
import { Users } from "@pp/server-core/users/Users"
import {
  blockLookupFor,
  expandTemplate,
  formatTicketBlock,
  Library as LibrarySchema,
  Tools,
  ToolFailure,
  ProjectStatus,
  StatusSlug,
  BranchNotFound,
  Conflict,
  CurrentUser,
  GroupId,
  NotFound,
  type Role,
  SprintCompletedImmutable,
  TicketId,
  TicketStatus,
  TagName,
  UserId,
  GroupColor,
  CommentId,
  type GroupDetail,
  type TicketListQuery,
  ProjectScope,
  Validation
} from "@pp/shared"
import * as Context from "effect/Context"
import * as DateTime from "effect/DateTime"
import * as Effect from "effect/Effect"
import * as Layer from "effect/Layer"
import * as Option from "effect/Option"
import * as Record from "effect/Record"
import * as Schema from "effect/Schema"

import { ToolHandlersLive } from "./handlers"
import { invokeTool, isToolName } from "./invokeTool"
import { ToolCaller } from "./ToolCaller"
import type { ToolServices } from "./ToolHandlers"

const decodeProjectStatuses = Schema.decodeSync(Schema.Array(ProjectStatus))

const decodeUnknownLibrarySchemaSync = Schema.decodeUnknownSync(LibrarySchema)

type ToolResult = {
  content: ReadonlyArray<{ type: "text"; text: string }>
  isError?: boolean
}

type HandlerServices = ToolServices

type Registered = Map<string, (input: Schema.Json) => Effect.Effect<ToolResult>>

const parseJson = (text: string) => JSON.parse(text)

const decodeFailure = Schema.decodeUnknownSync(ToolFailure)

const toResult = (
  result: Readonly<{ isFailure: boolean; encoded: unknown }>
): ToolResult =>
  result.isFailure
    ? {
        isError: true,
        content: [{ type: "text", text: decodeFailure(result.encoded).message }]
      }
    : {
        content: [
          { type: "text", text: JSON.stringify(result.encoded, null, 2) }
        ]
      }

const register = (runtime: Context.Context<HandlerServices>): Registered => {
  const registered: Registered = new Map()
  for (const name of Object.keys(Tools.tools)) {
    if (!isToolName(name)) continue
    registered.set(name, (input) =>
      Effect.flatMap(Tools, (toolkit) => invokeTool(toolkit, name, input)).pipe(
        Effect.map(toResult),
        Effect.catchTag("ToolInputInvalid", (error) =>
          Effect.succeed<ToolResult>({
            isError: true,
            content: [
              { type: "text", text: `Validation error: ${error.message}` }
            ]
          })
        ),
        Effect.provide(ToolHandlersLive),
        Effect.provideService(
          ToolCaller,
          Option.some({ user: fakeUser, client: Option.none() })
        ),
        Effect.provide(runtime)
      )
    )
  }
  return registered
}

const decodeTicketId = Schema.decodeUnknownSync(TicketId)
const isoDate = (s: string) => DateTime.toDate(DateTime.makeUnsafe(s))

const fakeTicket = {
  id: decodeTicketId("T-1"),
  title: "first",
  status: TicketStatus.make("todo"),
  type: "feat" as const,
  priority: "med" as const,
  estimate: null,
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

const TicketsStub = Layer.mergeAll(
  Layer.mock(TicketCommands.TicketCommands, {}),
  Layer.mock(TicketGit.TicketGit, {}),
  Layer.mock(TicketQueries.TicketQueries, {
    list: (query: TicketListQuery, limit?: number) => {
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
  })
)

const fakeUser = testUser("u-1")

const accessAs = (role: Role | null) =>
  Layer.succeed(Access, {
    org: (orgSlug) =>
      Effect.map(CurrentUser, (current) =>
        orgScope("member", { orgSlug, userId: current.id })
      ),
    project: (orgSlug, slug) =>
      Effect.flatMap(CurrentUser, (current) =>
        role === null
          ? Effect.fail(new NotFound())
          : Effect.succeed(
              projectScope("member", role, {
                orgSlug,
                slug,
                userId: current.id,
                projectId: slug
              })
            )
      ),
    projectsInOrg: () => Effect.succeed([])
  })

const AccessStub = accessAs("pm")
const withFakeUser = <T>(fn: () => Effect.Effect<T>) => Effect.suspend(fn)

const ProjectsStub = Layer.mock(Projects, {})

const ticketIndexProject: TicketProject = {
  orgSlug: "acme",
  organizationId: "org-1",
  projectId: "project-1",
  slug: "demo"
}

const TicketIndexStub = Layer.mock(TicketIndex, {
  projectsFor: () => Effect.succeed([]),
  assignedTo: () => Effect.succeed([]),
  touchedBy: () => Effect.succeed([]),
  countAssignedByStatus: () => Effect.succeed([]),
  assignedPerProject: () => Effect.succeed([]),
  projectFor: (_o, _s) => Effect.succeed(ticketIndexProject)
})

const TicketIndexMaintenanceStub = Layer.mock(
  TicketIndexMaintenance.TicketIndexMaintenance,
  {
    reconcileProject: (project: TicketProject, options?) =>
      Effect.succeed({
        project,
        drift: { missing: ["T-2"], orphaned: ["T-9"], stale: ["T-1"] },
        rebuilt: options?.force === true,
        indexed: 3,
        skipped: 1
      })
  }
)

const ProjectDocsStub = Layer.mock(ProjectDocs, {
  readRaw: (_o, _s) =>
    Effect.succeed({
      path: "orgs/acme/projects/demo/project.md",
      content: "---\nslug: demo\n---\n# Demo\n"
    })
})

const GroupDocsStub = Layer.mock(GroupDocs, {
  readRaw: (_o, _s, _id) =>
    Effect.succeed({
      path: "orgs/acme/projects/demo/groups/G-1.md",
      content: "---\nid: G-1\n---\n# Sprint 1\n"
    })
})

const TicketDocsStub = Layer.mock(TicketDocs, {
  readRaw: (_o, _s, _id) =>
    Effect.succeed({
      path: "orgs/acme/projects/demo/tickets/T-1.md",
      content: "---\nid: T-1\n---\n# Fix it\n"
    })
})

const ProjectStatusesStub = Layer.mock(ProjectStatuses, {
  list: () =>
    Effect.succeed(
      decodeProjectStatuses([
        {
          slug: "code_test",
          label: "Code Test",
          icon: "ShieldCheck",
          color: "#3b82f6",
          orderKey: "a0",
          description: "A PR is open and waiting for review",
          createdBy: "u-1",
          createdAt: "2026-05-01T00:00:00.000Z"
        },
        {
          slug: "done",
          label: "Done",
          icon: "CircleCheck",
          color: "#22c55e",
          orderKey: "a1",
          description: null,
          createdBy: "u-1",
          createdAt: "2026-05-01T00:00:00.000Z"
        }
      ])
    )
})

const ProjectGitAutomationStub = Layer.mock(ProjectGitAutomation, {
  get: () =>
    Effect.succeed({
      rules: {
        branch_linked: null,
        pr_draft_opened: StatusSlug.make("code_test"),
        pr_opened: StatusSlug.make("code_test"),
        pr_merged: StatusSlug.make("done"),
        pr_closed: null,
        branch_deleted: null
      },
      forwardOnly: true
    })
})

const TestLayer = Layer.mergeAll(
  AccessStub,
  Layer.mock(AttachmentUploads.AttachmentUploads, {}),
  Layer.mock(OrgStorage.OrgStorage, {}),
  TicketsStub,
  ProjectsStub,
  Layer.mock(Comments, {}),
  Layer.mock(Groups, {}),
  Layer.mock(Tags, {}),
  Layer.mock(Users, {}),
  Layer.mock(BetterAuth, {}),
  ProjectDocsStub,
  GroupDocsStub,
  TicketDocsStub,
  TicketIndexStub,
  TicketIndexMaintenanceStub,
  ProjectStatusesStub,
  Layer.mock(Library, {}),
  ProjectGitAutomationStub
)

describe("MCP handlers → list_tickets", () => {
  it.effect("threads the requested limit through to TicketQueries.list", () =>
    Effect.gen(function* () {
      capturedListLimits.length = 0
      capturedListQueries.length = 0
      const runtime = yield* Effect.context<HandlerServices>()
      const registered = register(runtime)
      const cb = registered.get("list_tickets")
      expect(cb).toBeDefined()
      const result = yield* Effect.suspend(() =>
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

describe("MCP handlers → list_statuses", () => {
  const listStatuses = Effect.gen(function* () {
    const registered = register(yield* Effect.context<HandlerServices>())
    const result = yield* Effect.suspend(() =>
      withFakeUser(() =>
        registered.get("list_statuses")!({
          orgSlug: "acme",
          projectSlug: "demo"
        })
      )
    )
    expect(result.isError).toBeUndefined()
    return parseJson(result.content[0].text)
  })

  it.effect(
    "returns each status with its description and the git events that set it",
    () =>
      Effect.gen(function* () {
        expect(yield* listStatuses).toEqual({
          statuses: [
            expect.objectContaining({
              slug: "code_test",
              label: "Code Test",
              description: "A PR is open and waiting for review",
              setBy: ["pr_draft_opened", "pr_opened"]
            }),
            expect.objectContaining({
              slug: "done",
              description: null,
              setBy: ["pr_merged"]
            })
          ],
          automationForwardOnly: true
        })
      }).pipe(Effect.provide(TestLayer))
  )

  it.effect("leaves automation out for callers who can't read GitHub", () =>
    Effect.gen(function* () {
      const payload = yield* listStatuses
      expect(payload.automationForwardOnly).toBeUndefined()
      expect(payload.statuses).toEqual([
        expect.not.objectContaining({ setBy: expect.anything() }),
        expect.not.objectContaining({ setBy: expect.anything() })
      ])
      expect(payload.statuses[0].description).toBe(
        "A PR is open and waiting for review"
      )
    }).pipe(Effect.provide(Layer.merge(TestLayer, accessAs("client"))))
  )
})

describe("MCP handlers → doc tools", () => {
  it.effect("get_project_doc returns DocFile-shaped JSON envelope", () =>
    Effect.gen(function* () {
      const registered = register(yield* Effect.context<HandlerServices>())
      const cb = registered.get("get_project_doc")
      expect(cb).toBeDefined()
      const result = yield* Effect.suspend(() =>
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
      const result = yield* Effect.suspend(() =>
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
      const result = yield* Effect.suspend(() =>
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
})

const acceptanceCriteriaBlock = {
  key: "acceptance-criteria",
  name: "Acceptance criteria",
  icon: "ListChecks" as const,
  color: null,
  description: "What must be true for this to be done",
  sync: false,
  content: "## Acceptance criteria\n\n- [ ] {{Given ... when ... then ...}}",
  origin: "org" as const,
  shadows: null,
  hidden: false
}

const hiddenBlock = {
  ...acceptanceCriteriaBlock,
  key: "hidden-block",
  name: "Hidden block",
  hidden: true
}

const bugReportTemplate = {
  key: "bug-report",
  name: "Bug report",
  icon: "Bug" as const,
  color: null,
  description: "Something is broken",
  priority: "med" as const,
  tags: [],
  body: formatTicketBlock("acceptance-criteria", ""),
  origin: "org" as const,
  shadows: null,
  hidden: false
}

const hiddenTemplate = {
  ...bugReportTemplate,
  key: "hidden-template",
  name: "Hidden template",
  hidden: true
}

const fakeLibrary = Schema.decodeUnknownSync(LibrarySchema)({
  blocks: [acceptanceCriteriaBlock, hiddenBlock],
  templates: [bugReportTemplate, hiddenTemplate],
  defaults: {
    feat: null,
    bug: "bug-report",
    chore: null,
    other: null,
    epic: null
  },
  ownDefaults: { bug: "bug-report" },
  inheritedDefaults: {
    feat: null,
    bug: null,
    chore: null,
    other: null,
    epic: null
  },
  canEdit: true
})

const LibraryStub = Layer.mock(Library, {
  projectLibrary: () => Effect.succeed(fakeLibrary)
})

describe("MCP handlers → list_blocks / list_templates", () => {
  const LibraryTestLayer = Layer.mergeAll(TestLayer, LibraryStub)

  it.effect("list_blocks returns visible blocks with hints kept", () =>
    Effect.gen(function* () {
      const registered = register(yield* Effect.context<HandlerServices>())
      const cb = registered.get("list_blocks")!
      const result = yield* Effect.suspend(() =>
        withFakeUser(() => cb({ orgSlug: "acme", projectSlug: "demo" }))
      )

      expect(result.isError).toBeUndefined()
      const payload = parseJson(result.content[0].text)
      expect(payload).toHaveLength(1)
      expect(payload[0]).toMatchObject({
        key: "acceptance-criteria",
        origin: "org",
        sync: false
      })
      expect(payload[0].content).toContain("{{")
    }).pipe(Effect.provide(LibraryTestLayer))
  )

  it.effect(
    "list_templates expands blocks with hints kept and reports defaults",
    () =>
      Effect.gen(function* () {
        const registered = register(yield* Effect.context<HandlerServices>())
        const cb = registered.get("list_templates")!
        const result = yield* Effect.suspend(() =>
          withFakeUser(() => cb({ orgSlug: "acme", projectSlug: "demo" }))
        )

        expect(result.isError).toBeUndefined()
        const payload = parseJson(result.content[0].text)
        expect(payload).toHaveLength(1)
        expect(payload[0].key).toBe("bug-report")
        expect(payload[0].body).toContain("{{")
        expect(payload[0].body).toContain('<block type="acceptance-criteria">')
        expect(payload[0].isDefaultFor).toEqual(["bug"])
        expect(payload[0]).not.toHaveProperty("type")
      }).pipe(Effect.provide(LibraryTestLayer))
  )
})

const bigBlock = (key: string) => ({
  ...acceptanceCriteriaBlock,
  key,
  name: key,
  content: `## ${key}\n\n${"x".repeat(15_000)}`
})

const BigLibraryStub = Layer.mock(Library, {
  projectLibrary: () =>
    Effect.succeed(
      decodeUnknownLibrarySchemaSync({
        blocks: [bigBlock("a"), bigBlock("b")],
        templates: [
          {
            ...bugReportTemplate,
            body: [formatTicketBlock("a", ""), formatTicketBlock("b", "")].join(
              "\n\n"
            )
          }
        ],
        defaults: {
          feat: null,
          bug: null,
          chore: null,
          other: null,
          epic: null
        },
        ownDefaults: {},
        inheritedDefaults: {
          feat: null,
          bug: null,
          chore: null,
          other: null,
          epic: null
        },
        canEdit: true
      })
    )
})

describe("MCP handlers → list_templates size", () => {
  it.effect("returns a template whose expansion exceeds the content cap", () =>
    Effect.gen(function* () {
      const registered = register(yield* Effect.context<HandlerServices>())
      const cb = registered.get("list_templates")!
      const result = yield* Effect.suspend(() =>
        withFakeUser(() => cb({ orgSlug: "acme", projectSlug: "demo" }))
      )

      expect(result.isError).toBeUndefined()
      const payload = parseJson(result.content[0].text)
      expect(payload[0].body.length).toBeGreaterThan(30_000)
    }).pipe(Effect.provide(Layer.mergeAll(TestLayer, BigLibraryStub)))
  )
})

describe("MCP handlers → write tools", () => {
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
    archive?: any
  } = {}

  const WriteTicketsStub = Layer.mergeAll(
    Layer.mock(TicketCommands.TicketCommands, {
      create: (input) => {
        captured.create = input
        return Effect.succeed({ ...fakeTicketDetail, ...input })
      },
      update: (_id, input) => {
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
      archive: (id, reason) => {
        captured.archive = { id, reason }
        if (id === "T-2") {
          return Effect.fail(
            new Conflict({ reason: "ticket_already_archived" })
          )
        }
        return Effect.succeed({
          ...fakeTicketDetail,
          archivedAt: isoDate("2026-05-11T00:00:00.000Z")
        })
      },
      unarchive: (_id) => Effect.succeed(fakeTicketDetail)
    }),
    Layer.mock(TicketGit.TicketGit, {
      attachBranch: (_id, input) => {
        captured.attach = input
        if (input.name === "missing/branch") {
          return Effect.fail(new BranchNotFound({ name: input.name }))
        }
        return Effect.succeed({ ...fakeTicketDetail, branch: input.name })
      }
    }),
    Layer.mock(TicketQueries.TicketQueries, {
      get: (_id) =>
        Effect.succeed({
          ...fakeTicketDetail,
          body: [
            "Some context.",
            formatTicketBlock(
              "acceptance-criteria",
              "## Acceptance criteria\n\n- [x] Done"
            ),
            formatTicketBlock(
              "definition-of-done",
              "## Definition of done\n\n- [ ] Reviewed",
              { sync: true }
            )
          ].join("\n\n")
        })
    })
  )

  const WriteCommentsStub = Layer.mock(Comments, {
    create: (ticketId, input: { body: string }) => {
      captured.createComment = { ticketId, body: input.body }
      return Effect.succeed({
        id: CommentId.make("c_test1234"),
        ticketId,
        projectSlug: "demo",
        author: {
          kind: "user",
          user: {
            id: UserId.make("u-1"),
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
          }
        },
        origin: "native",
        body: input.body,
        createdAt: isoDate("2026-05-13T00:00:00.000Z"),
        editedAt: null
      })
    }
  })

  const WriteTestLayer = Layer.mergeAll(
    TestLayer,
    WriteTicketsStub,
    WriteCommentsStub,
    LibraryStub
  )

  it.effect("get_ticket splits the resolved body into a blocks breakdown", () =>
    Effect.gen(function* () {
      const registered = register(yield* Effect.context<HandlerServices>())
      const cb = registered.get("get_ticket")!
      const result = yield* Effect.suspend(() =>
        withFakeUser(() =>
          cb({ orgSlug: "acme", projectSlug: "demo", id: "T-1" })
        )
      )

      expect(result.isError).toBeUndefined()
      const payload = parseJson(result.content[0].text)
      expect(payload.body).toContain("Some context.")
      expect(payload.blocks).toEqual([
        {
          type: "acceptance-criteria",
          sync: false,
          content: "## Acceptance criteria\n\n- [x] Done"
        },
        {
          type: "definition-of-done",
          sync: true,
          content: "## Definition of done\n\n- [ ] Reviewed"
        }
      ])
    }).pipe(Effect.provide(WriteTestLayer))
  )

  it.effect("create_ticket forwards all fields and returns TicketDetail", () =>
    Effect.gen(function* () {
      captured.create = undefined
      const registered = register(yield* Effect.context<HandlerServices>())
      const cb = registered.get("create_ticket")!
      yield* Effect.gen(function* () {
        const result = yield* withFakeUser(() =>
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
      yield* Effect.gen(function* () {
        const result = yield* withFakeUser(() =>
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

  it.effect(
    "create_ticket rejects malformed block markup with a line-specific reason",
    () =>
      Effect.gen(function* () {
        captured.create = undefined
        const registered = register(yield* Effect.context<HandlerServices>())
        const cb = registered.get("create_ticket")!
        yield* Effect.gen(function* () {
          const result = yield* withFakeUser(() =>
            cb({
              orgSlug: "acme",
              projectSlug: "demo",
              title: "bad markup",
              body: '<block type="Not Kebab">\n\nstuff\n\n</block>'
            })
          )

          expect(result.isError).toBe(true)
          expect(result.content[0].text).toContain("line 1")
          expect(captured.create).toBeUndefined()
        })
      }).pipe(Effect.provide(WriteTestLayer))
  )

  it.effect(
    "create_ticket strips hints inside blocks before saving, leaving loose text alone",
    () =>
      Effect.gen(function* () {
        captured.create = undefined
        const registered = register(yield* Effect.context<HandlerServices>())
        const cb = registered.get("create_ticket")!
        const body = [
          "Some loose context. {{keep me}}",
          formatTicketBlock(
            "acceptance-criteria",
            "## Acceptance criteria\n\n- [ ] {{Given ... when ... then ...}}"
          )
        ].join("\n\n")
        yield* Effect.gen(function* () {
          const result = yield* withFakeUser(() =>
            cb({
              orgSlug: "acme",
              projectSlug: "demo",
              title: "with a block",
              body
            })
          )

          expect(result.isError).toBeUndefined()
          expect(captured.create.body).toContain(
            "Some loose context. {{keep me}}"
          )
          expect(captured.create.body).toContain("## Acceptance criteria")
          expect(captured.create.body).not.toContain("{{Given")
        })
      }).pipe(Effect.provide(WriteTestLayer))
  )

  it.effect("create_ticket keeps text that only looks like a hint", () =>
    Effect.gen(function* () {
      captured.create = undefined
      const registered = register(yield* Effect.context<HandlerServices>())
      const cb = registered.get("create_ticket")!
      const body = [
        formatTicketBlock(
          "acceptance-criteria",
          "## Acceptance criteria\n\n- [ ] NPM_TOKEN: ${{ secrets.NPM_TOKEN }}\n- [ ] Hi {{ user.firstName }}"
        ),
        formatTicketBlock("unknown-block", "## Notes\n\n{{kept}}")
      ].join("\n\n")
      yield* Effect.gen(function* () {
        const result = yield* withFakeUser(() =>
          cb({
            orgSlug: "acme",
            projectSlug: "demo",
            title: "look-alike hints",
            body
          })
        )

        expect(result.isError).toBeUndefined()
        expect(captured.create.body).toBe(body)
      })
    }).pipe(Effect.provide(WriteTestLayer))
  )

  it.effect("update_ticket strips hints inside blocks before saving", () =>
    Effect.gen(function* () {
      captured.update = undefined
      const registered = register(yield* Effect.context<HandlerServices>())
      const cb = registered.get("update_ticket")!
      const body = formatTicketBlock(
        "acceptance-criteria",
        "## Acceptance criteria\n\n- [ ] {{Given ... when ... then ...}}"
      )
      yield* Effect.gen(function* () {
        const result = yield* withFakeUser(() =>
          cb({
            orgSlug: "acme",
            projectSlug: "demo",
            id: "T-1",
            body
          })
        )

        expect(result.isError).toBeUndefined()
        expect(captured.update.body).toContain("## Acceptance criteria")
        expect(captured.update.body).not.toContain("{{Given")
      })
    }).pipe(Effect.provide(WriteTestLayer))
  )

  it.effect("create_comment returns the created comment", () =>
    Effect.gen(function* () {
      captured.createComment = undefined
      const registered = register(yield* Effect.context<HandlerServices>())
      const cb = registered.get("create_comment")!
      yield* Effect.gen(function* () {
        const result = yield* withFakeUser(() =>
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

  it.effect(
    "archive_ticket forwards the reason and restore_ticket clears archivedAt",
    () =>
      Effect.gen(function* () {
        captured.archive = undefined
        const registered = register(yield* Effect.context<HandlerServices>())
        yield* Effect.gen(function* () {
          const archived = yield* withFakeUser(() =>
            registered.get("archive_ticket")!({
              orgSlug: "acme",
              projectSlug: "demo",
              id: "T-1",
              reason: "Folded into T-2."
            })
          )
          expect(archived.isError).toBeUndefined()
          expect(parseJson(archived.content[0].text).archivedAt).not.toBeNull()
          expect(captured.archive).toEqual({
            id: "T-1",
            reason: "Folded into T-2."
          })

          const restored = yield* withFakeUser(() =>
            registered.get("restore_ticket")!({
              orgSlug: "acme",
              projectSlug: "demo",
              id: "T-1"
            })
          )
          expect(restored.isError).toBeUndefined()
          expect(parseJson(restored.content[0].text).archivedAt).toBeNull()
        })
      }).pipe(Effect.provide(WriteTestLayer))
  )

  it.effect(
    "archive_ticket reports an already archived ticket as Conflict",
    () =>
      Effect.gen(function* () {
        const registered = register(yield* Effect.context<HandlerServices>())
        yield* Effect.gen(function* () {
          const result = yield* withFakeUser(() =>
            registered.get("archive_ticket")!({
              orgSlug: "acme",
              projectSlug: "demo",
              id: "T-2"
            })
          )
          expect(result.isError).toBe(true)
          expect(result.content[0].text).toContain(
            "Conflict (ticket_already_archived)"
          )
        })
      }).pipe(Effect.provide(WriteTestLayer))
  )

  it.effect("attach_branch returns ticket with branch set on happy path", () =>
    Effect.gen(function* () {
      const registered = register(yield* Effect.context<HandlerServices>())
      const cb = registered.get("attach_branch")!
      yield* Effect.gen(function* () {
        const result = yield* withFakeUser(() =>
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
      yield* Effect.gen(function* () {
        const result = yield* withFakeUser(() =>
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

  const ForbiddenLayer = Layer.mergeAll(
    TestLayer,
    accessAs("developer"),
    WriteTicketsStub,
    WriteCommentsStub
  )
  it.effect(
    "rebuild_ticket_index force rebuilds and returns the detected drift",
    () =>
      Effect.gen(function* () {
        const registered = register(yield* Effect.context<HandlerServices>())
        const cb = registered.get("rebuild_ticket_index")!
        yield* Effect.gen(function* () {
          const result = yield* withFakeUser(() =>
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
        yield* Effect.gen(function* () {
          const result = yield* withFakeUser(() =>
            cb({ orgSlug: "acme", projectSlug: "demo" })
          )

          expect(result.isError).toBe(true)
          expect(result.content[0].text.toLowerCase()).toContain("forbidden")
        })
      }).pipe(Effect.provide(ForbiddenLayer))
  )
})

describe("MCP handlers → update_ticket with a template or edits", () => {
  const expandedBody = expandTemplate(
    bugReportTemplate,
    blockLookupFor(fakeLibrary)
  )
  const state: {
    currentBody: string
    concurrentBody?: string
    update?: any
  } = { currentBody: "" }

  const TemplateTicketsStub = Layer.mergeAll(
    Layer.mock(TicketCommands.TicketCommands, {
      create: (input) =>
        Effect.succeed({
          ...fakeTicket,
          creator: null,
          updater: null,
          title: input.title,
          body: input.body ?? ""
        }),
      update: (_id, input, _sort, expected) => {
        state.update = input
        if (
          expected?.body !== undefined &&
          state.currentBody !== expected.body
        ) {
          return Effect.fail(new Validation({ reason: "ticket_body_changed" }))
        }
        return Effect.succeed({
          ticket: {
            ...fakeTicket,
            creator: null,
            updater: null,
            body: input.body ?? state.currentBody
          },
          orderKey: null
        })
      }
    }),
    Layer.mock(TicketGit.TicketGit, {}),
    Layer.mock(TicketQueries.TicketQueries, {
      get: (_id) => {
        const body = state.currentBody
        if (state.concurrentBody !== undefined) {
          state.currentBody = state.concurrentBody
        }
        return Effect.succeed({
          ...fakeTicket,
          creator: null,
          updater: null,
          body
        })
      }
    })
  )

  const TemplateLibraryStub = Layer.mock(Library, {
    projectLibrary: () => Effect.succeed(fakeLibrary),
    expandForCreate: (_o: string, _s: string, key: string) =>
      key === "bug-report"
        ? Effect.succeed({
            body: expandedBody,
            type: "bug",
            priority: "high",
            tags: [TagName.make("from-template")]
          })
        : Effect.fail(new Validation({ reason: `unknown_template:${key}` }))
  })

  const TemplateTestLayer = Layer.mergeAll(
    TestLayer,
    TemplateTicketsStub,
    TemplateLibraryStub
  )

  const updateWith = (
    currentBody: string,
    input: Record<string, unknown>,
    concurrentBody?: string
  ) =>
    Effect.gen(function* () {
      state.currentBody = currentBody
      state.concurrentBody = concurrentBody
      state.update = undefined
      const registered = register(yield* Effect.context<HandlerServices>())
      return yield* withFakeUser(() =>
        registered.get("update_ticket")!({
          orgSlug: "acme",
          projectSlug: "demo",
          id: "T-1",
          ...input
        })
      )
    })

  it.effect("expands the template into an empty description, body only", () =>
    Effect.gen(function* () {
      const result = yield* updateWith("", { template: "bug-report" })

      expect(result.isError).toBeUndefined()
      expect(state.update).toEqual({ body: expandedBody })
      const payload = parseJson(result.content[0].text)
      expect(payload.blocks).toEqual([
        expect.objectContaining({ type: "acceptance-criteria", sync: false })
      ])
    }).pipe(Effect.provide(TemplateTestLayer))
  )

  it.effect("replaces a description that is still an untouched template", () =>
    Effect.gen(function* () {
      const result = yield* updateWith(expandedBody, {
        template: "bug-report",
        priority: "low"
      })

      expect(result.isError).toBeUndefined()
      expect(state.update).toEqual({ body: expandedBody, priority: "low" })
    }).pipe(Effect.provide(TemplateTestLayer))
  )

  it.effect("refuses to overwrite a description with written content", () =>
    Effect.gen(function* () {
      const result = yield* updateWith("Some context worth keeping.", {
        template: "bug-report"
      })

      expect(result.isError).toBe(true)
      expect(result.content[0].text).toContain("list_templates")
      expect(result.content[0].text).toContain("as body")
      expect(state.update).toBeUndefined()
    }).pipe(Effect.provide(TemplateTestLayer))
  )

  it.effect("preserves a description edited after template validation", () =>
    Effect.gen(function* () {
      const result = yield* updateWith(
        "",
        { template: "bug-report" },
        "A concurrent edit"
      )

      expect(result.isError).toBe(true)
      expect(result.content[0].text).toContain("as body")
      expect(state.currentBody).toBe("A concurrent edit")
    }).pipe(Effect.provide(TemplateTestLayer))
  )

  it.effect("surfaces an unknown template key", () =>
    Effect.gen(function* () {
      const result = yield* updateWith("", { template: "nope" })

      expect(result.isError).toBe(true)
      expect(result.content[0].text).toContain('Unknown template "nope"')
      expect(state.update).toBeUndefined()
    }).pipe(Effect.provide(TemplateTestLayer))
  )

  it.effect("checks membership before looking up a template", () => {
    let expanded = false
    const ProbedLibraryStub = Layer.mock(Library, {
      expandForCreate: () => {
        expanded = true
        return Effect.fail(new Validation({ reason: "unknown_template:nope" }))
      }
    })
    return Effect.gen(function* () {
      const result = yield* updateWith("", { template: "nope" })

      expect(result.isError).toBe(true)
      expect(result.content[0].text).toBe("Not found.")
      expect(expanded).toBe(false)
    }).pipe(
      Effect.provide(
        Layer.mergeAll(
          TestLayer,
          TemplateTicketsStub,
          ProbedLibraryStub,
          accessAs(null)
        )
      )
    )
  })

  it.effect("lets an explicit body win over the template", () =>
    Effect.gen(function* () {
      const result = yield* updateWith("Some context worth keeping.", {
        template: "bug-report",
        body: "Filled in by hand."
      })

      expect(result.isError).toBeUndefined()
      expect(state.update).toEqual({ body: "Filled in by hand." })
    }).pipe(Effect.provide(TemplateTestLayer))
  )

  it.effect("create_ticket returns the blocks breakdown", () =>
    Effect.gen(function* () {
      const registered = register(yield* Effect.context<HandlerServices>())
      const result = yield* withFakeUser(() =>
        registered.get("create_ticket")!({
          orgSlug: "acme",
          projectSlug: "demo",
          title: "with blocks",
          body: expandedBody
        })
      )

      expect(result.isError).toBeUndefined()
      expect(parseJson(result.content[0].text).blocks).toEqual([
        expect.objectContaining({ type: "acceptance-criteria", sync: false })
      ])
    }).pipe(Effect.provide(TemplateTestLayer))
  )

  it.effect("ticks one criterion with an edit, sending only the change", () =>
    Effect.gen(function* () {
      const result = yield* updateWith("Intro.\n\n- [ ] Ship it", {
        edits: [
          {
            kind: "replace",
            oldText: "- [ ] Ship it",
            newText: "- [x] Ship it"
          }
        ]
      })

      expect(result.isError).toBeUndefined()
      expect(state.update).toEqual({ body: "Intro.\n\n- [x] Ship it" })
    }).pipe(Effect.provide(TemplateTestLayer))
  )

  it.effect("appends attachment markdown to the description", () =>
    Effect.gen(function* () {
      yield* updateWith("Intro.", {
        edits: [{ kind: "append", text: "![shot.png](/api/attachments/o/1)" }]
      })

      expect(state.update).toEqual({
        body: "Intro.\n\n![shot.png](/api/attachments/o/1)"
      })
    }).pipe(Effect.provide(TemplateTestLayer))
  )

  it.effect("saves nothing when one edit in the list fails", () =>
    Effect.gen(function* () {
      const result = yield* updateWith("- [ ] a\n- [ ] b", {
        edits: [
          { kind: "append", text: "More." },
          { kind: "replace", oldText: "- [ ]", newText: "- [x]" }
        ]
      })

      expect(result.isError).toBe(true)
      expect(result.content[0].text).toBe(
        "edits[1] failed: oldText appears 2 times; include more surrounding " +
          "text so it matches once, or set replaceAll. Nothing was saved."
      )
      expect(state.update).toBeUndefined()
    }).pipe(Effect.provide(TemplateTestLayer))
  )

  it.effect("rejects edits combined with a body", () =>
    Effect.gen(function* () {
      const result = yield* updateWith("Intro.", {
        body: "Rewrite",
        edits: [{ kind: "append", text: "More." }]
      })

      expect(result.isError).toBe(true)
      expect(result.content[0].text).toContain("can't be combined with body")
      expect(state.update).toBeUndefined()
    }).pipe(Effect.provide(TemplateTestLayer))
  )

  it.effect("reapplies edits on top of a description changed mid-update", () =>
    Effect.gen(function* () {
      const result = yield* updateWith(
        "- [ ] a",
        { edits: [{ kind: "append", text: "More." }] },
        "- [ ] a\n- [ ] b"
      )

      expect(result.isError).toBeUndefined()
      expect(state.update).toEqual({ body: "- [ ] a\n- [ ] b\n\nMore." })
    }).pipe(Effect.provide(TemplateTestLayer))
  )

  it.effect(
    "passes expectedUpdatedAt through as the update's expectation",
    () => {
      let seen: unknown
      const ExpectingTicketsStub = Layer.mergeAll(
        Layer.mock(TicketCommands.TicketCommands, {
          update: (_id, input, _sort, expected) => {
            seen = expected
            return Effect.succeed({
              ticket: {
                ...fakeTicket,
                creator: null,
                updater: null,
                body: input.body ?? ""
              },
              orderKey: null
            })
          }
        }),
        Layer.mock(TicketGit.TicketGit, {}),
        Layer.mock(TicketQueries.TicketQueries, {})
      )
      return Effect.gen(function* () {
        yield* updateWith("", {
          body: "Rewrite",
          expectedUpdatedAt: "2026-05-10T00:00:00.000Z"
        })

        expect(seen).toEqual({
          body: undefined,
          updatedAt: isoDate("2026-05-10T00:00:00.000Z")
        })
      }).pipe(
        Effect.provide(
          Layer.mergeAll(TestLayer, ExpectingTicketsStub, TemplateLibraryStub)
        )
      )
    }
  )
})

describe("MCP handlers → add_tickets_to_group", () => {
  const decodeGroupId = Schema.decodeUnknownSync(GroupId)

  const makeGroupsStub = (behaviour: "ok" | "completed" = "ok") => {
    const captured: {
      orgSlug?: string
      userId?: string
      slug?: string
      groupId?: string
      ticketIds?: ReadonlyArray<string>
    } = {}
    const stub = Layer.mock(Groups, {
      addTickets: (groupId: string, ticketIds: ReadonlyArray<string>) =>
        Effect.flatMap(ProjectScope, (scope) => {
          captured.orgSlug = scope.orgSlug
          captured.userId = scope.userId
          captured.slug = scope.slug
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
              color: GroupColor.make("#3366ff"),
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
        })
    })
    return { stub, captured }
  }

  const makeLayer = (groupsLayer: Layer.Layer<Groups>) =>
    Layer.mergeAll(
      TestLayer,
      Layer.mergeAll(
        Layer.mock(TicketCommands.TicketCommands, {}),
        Layer.mock(TicketGit.TicketGit, {}),
        Layer.mock(TicketQueries.TicketQueries, {})
      ),
      groupsLayer
    )

  const registerAndCall = (
    runtime: Context.Context<HandlerServices>,
    input: Schema.Json
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
      const result = yield* Effect.suspend(() => call())

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
      const result = yield* Effect.suspend(() => call())

      expect(result.isError).toBe(true)
      expect(result.content[0].text.toLowerCase()).toContain("sprint")
    }).pipe(Effect.provide(makeLayer(completedStub)))
  )
})

describe("MCP handlers → sprint writes", () => {
  const decodeGroupId = Schema.decodeUnknownSync(GroupId)

  const baseGroup = (
    overrides: Readonly<{ id?: string; kind?: GroupDetail["kind"] }> = {}
  ) => ({
    id: decodeGroupId(overrides.id ?? "G-1"),
    name: "Sprint 1",
    kind: overrides.kind ?? "sprint",
    tickets: [],
    color: GroupColor.make("#3366ff"),
    startsAt: null,
    endsAt: null,
    completedAt: null,
    createdBy: "u-1",
    createdAt: isoDate("2026-04-01T00:00:00.000Z"),
    updatedAt: isoDate("2026-05-12T00:00:00.000Z"),
    body: "# Sprint 1\n"
  })

  const makeGroupsStub = (
    options: { kind?: GroupDetail["kind"]; completed?: boolean } = {}
  ) => {
    const captured: {
      createInput?: any
      updateInput?: any
      completeInput?: any
    } = {}
    const stub = Layer.mock(Groups, {
      get: (id) => Effect.succeed(baseGroup({ id, kind: options.kind })),
      create: (input) => {
        captured.createInput = input
        return Effect.succeed({
          id: decodeGroupId("G-9"),
          name: input.name,
          kind: input.kind ?? "sprint",
          tickets: input.tickets ?? [],
          color: input.color ?? GroupColor.make("#3366ff"),
          startsAt: input.startsAt ?? null,
          endsAt: input.endsAt ?? null,
          completedAt: null,
          createdBy: "u-1",
          createdAt: isoDate("2026-05-13T00:00:00.000Z"),
          updatedAt: isoDate("2026-05-13T00:00:00.000Z")
        })
      },
      update: (id, input) => {
        captured.updateInput = input
        return Effect.succeed({
          ...baseGroup({ id, kind: options.kind }),
          ...input
        })
      },
      complete: (id, input) => {
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
    })
    return { stub, captured }
  }

  const makeLayer = (groupsLayer: Layer.Layer<Groups>) =>
    Layer.mergeAll(
      TestLayer,
      Layer.mergeAll(
        Layer.mock(TicketCommands.TicketCommands, {}),
        Layer.mock(TicketGit.TicketGit, {}),
        Layer.mock(TicketQueries.TicketQueries, {})
      ),
      groupsLayer
    )

  const registerAndCall = (
    name: string,
    runtime: Context.Context<HandlerServices>,
    input: Schema.Json
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
        const result = yield* Effect.suspend(() => call())

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
      const result = yield* Effect.suspend(() => call())

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
      const result = yield* Effect.suspend(() => call())

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
      const result = yield* Effect.suspend(() => call())

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
      const result = yield* Effect.suspend(() => call())

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
      const result = yield* Effect.suspend(() => call())

      expect(result.isError).toBe(true)
      // Specific surfaced text — confirms SprintCompletedImmutable's mapping
      // in errorMap, not just any error class.
      expect(result.content[0].text.toLowerCase()).toContain(
        "sprint is already completed"
      )
    }).pipe(Effect.provide(makeLayer(completedSprint.stub)))
  )
})

describe("MCP handlers → NotFound retained", () => {
  const HiddenLayer = Layer.mergeAll(TestLayer, accessAs(null))

  it.effect(
    "get_ticket_doc returns NotFound when caller can't see the project",
    () =>
      Effect.gen(function* () {
        const registered = register(yield* Effect.context<HandlerServices>())
        const cb = registered.get("get_ticket_doc")
        const result = yield* Effect.suspend(() =>
          withFakeUser(() =>
            cb!({ orgSlug: "acme", projectSlug: "demo", id: "T-1" })
          )
        )

        expect(result.isError).toBe(true)
        expect(result.content[0].text).toBe("Not found.")
      }).pipe(Effect.provide(HiddenLayer))
  )
})
