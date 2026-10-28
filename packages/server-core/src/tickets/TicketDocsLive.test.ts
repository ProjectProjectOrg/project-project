import * as BunServices from "@effect/platform-bun/BunServices"
import { it } from "@effect/vitest"
import {
  ActivityActor,
  TicketId,
  TicketStatus,
  type Estimate
} from "@pp/shared"
import * as ConfigProvider from "effect/ConfigProvider"
import * as DateTime from "effect/DateTime"
import * as Effect from "effect/Effect"
import * as FileSystem from "effect/FileSystem"
import * as Layer from "effect/Layer"
import * as Schema from "effect/Schema"
import { describe, expect } from "vitest"

import {
  passthroughTicketActivity,
  recordingTicketActivity,
  type RecordedActivity
} from "../activity/testing"
import type { TicketActivity } from "../activity/TicketActivity"
import * as KeyedLock from "../locks/KeyedLock"
import { Markdown } from "../markdown/Markdown"
import { MarkdownLive } from "../markdown/MarkdownLive"
import { FinishedStatuses } from "../projects/FinishedStatuses"
import { TicketDocs, type TicketDocument } from "./TicketDocs"
import { TicketDocsLive } from "./TicketDocsLive"

const testLayer = (
  activity: Layer.Layer<TicketActivity> = passthroughTicketActivity
) =>
  Layer.unwrap(
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem
      const tmpRoot = yield* fs.makeTempDirectoryScoped({
        prefix: "projectproject-ticket-docs-"
      })
      return TicketDocsLive.pipe(
        Layer.provide(
          Layer.mergeAll(KeyedLock.layer, FinishedStatuses.baseline)
        ),
        Layer.provide(activity),
        Layer.provideMerge(
          MarkdownLive.pipe(
            Layer.provideMerge(
              ConfigProvider.layer(
                ConfigProvider.fromUnknown({ PROJECTS_DIR: tmpRoot })
              )
            )
          )
        )
      )
    })
  ).pipe(Layer.provideMerge(BunServices.layer))

const TestLayer = testLayer()

const ticketId = Schema.decodeUnknownSync(TicketId)
const ticketStatus = Schema.decodeUnknownSync(TicketStatus)

const ticketDocument = (
  id: string,
  branchAutoLinkDisabled?: boolean
): TicketDocument => ({
  id: ticketId(id),
  title: "Persist branch matching preference",
  status: ticketStatus("todo"),
  type: "chore",
  priority: "med",
  tags: [],
  branch: "chore/branch-matching",
  branchAutoLinkDisabled,
  pr: null,
  prState: null,
  lastTransitionedPr: null,
  assignees: [],
  archivedAt: null,
  createdBy: "user-1",
  createdAt: DateTime.toDate(DateTime.makeUnsafe("2026-09-07T10:00:00Z")),
  updatedBy: "user-1",
  updatedAt: DateTime.toDate(DateTime.makeUnsafe("2026-09-07T10:00:00Z")),
  commentsRegion: "",
  body: "# Branch matching\n"
})

describe("TicketDocs branch matching persistence", () => {
  it.effect("round-trips branchAutoLinkDisabled=true through markdown", () =>
    Effect.gen(function* () {
      const docs = yield* TicketDocs
      yield* docs.create("acme", "project", ticketDocument("T-1", true))

      const document = yield* docs.read("acme", "project", "T-1")
      const raw = yield* docs.readRaw("acme", "project", "T-1")

      expect(document.branchAutoLinkDisabled).toBe(true)
      expect(raw.content).toContain("branchAutoLinkDisabled: true")
    }).pipe(Effect.provide(TestLayer))
  )

  it.effect("omits branchAutoLinkDisabled after writing false", () =>
    Effect.gen(function* () {
      const docs = yield* TicketDocs
      yield* docs.create("acme", "project", ticketDocument("T-2", true))
      yield* docs.write("acme", "project", "T-2", ticketDocument("T-2", false))

      const document = yield* docs.read("acme", "project", "T-2")
      const raw = yield* docs.readRaw("acme", "project", "T-2")

      expect(document.branchAutoLinkDisabled).toBeUndefined()
      expect(raw.content).not.toContain("branchAutoLinkDisabled")
    }).pipe(Effect.provide(TestLayer))
  )

  it.effect("decodes a ticket without branchAutoLinkDisabled", () =>
    Effect.gen(function* () {
      const markdown = yield* Markdown
      const docs = yield* TicketDocs
      yield* markdown.createTicketFile(
        "acme",
        "project",
        "T-3",
        {
          id: "T-3",
          title: "Ticket",
          status: "todo",
          type: "chore",
          priority: "med",
          tags: [],
          branch: null,
          pr: null,
          prState: null,
          lastTransitionedPr: null,
          assignees: [],
          archivedAt: null,
          createdBy: "user-1",
          createdAt: "2026-09-07T10:00:00Z",
          updatedAt: "2026-09-07T10:00:00Z"
        },
        "# Ticket\n"
      )

      const document = yield* docs.read("acme", "project", "T-3")
      expect(document.branchAutoLinkDisabled).toBeUndefined()
    }).pipe(Effect.provide(TestLayer))
  )

  it.effect("decodes the singular assignee field", () =>
    Effect.gen(function* () {
      const markdown = yield* Markdown
      const docs = yield* TicketDocs
      yield* markdown.createTicketFile(
        "acme",
        "project",
        "T-4",
        {
          id: "T-4",
          title: "Ticket",
          status: "todo",
          type: "chore",
          priority: "med",
          tags: [],
          branch: null,
          pr: null,
          prState: null,
          lastTransitionedPr: null,
          assignee: "user-1",
          archivedAt: null,
          createdBy: "user-2",
          createdAt: "2026-09-07T10:00:00Z",
          updatedAt: "2026-09-07T10:00:00Z"
        },
        "# Ticket\n"
      )

      const document = yield* docs.read("acme", "project", "T-4")
      expect(document.assignees).toEqual(["user-1"])
    }).pipe(Effect.provide(TestLayer))
  )

  it.effect("decodes a null singular assignee field", () =>
    Effect.gen(function* () {
      const markdown = yield* Markdown
      const docs = yield* TicketDocs
      yield* markdown.createTicketFile(
        "acme",
        "project",
        "T-5",
        {
          id: "T-5",
          title: "Ticket",
          status: "todo",
          type: "chore",
          priority: "med",
          tags: [],
          branch: null,
          pr: null,
          prState: null,
          lastTransitionedPr: null,
          assignee: null,
          archivedAt: null,
          createdBy: "user-2",
          createdAt: "2026-09-07T10:00:00Z",
          updatedAt: "2026-09-07T10:00:00Z"
        },
        "# Ticket\n"
      )

      const document = yield* docs.read("acme", "project", "T-5")
      expect(document.assignees).toEqual([])
    }).pipe(Effect.provide(TestLayer))
  )
})

describe("TicketDocs branches persistence", () => {
  it.effect("writes the ticket's branch and its stack as one list", () =>
    Effect.gen(function* () {
      const docs = yield* TicketDocs
      const stack = [
        {
          branch: "feat/T-21-ui",
          base: "chore/branch-matching",
          pr: 42,
          prState: "merged" as const,
          landed: true
        },
        {
          branch: "feat/T-21-polish",
          base: "feat/T-21-ui",
          pr: 43,
          prState: "open" as const,
          prDraft: true
        },
        { branch: "feat/T-21-docs" }
      ]
      yield* docs.create("acme", "project", {
        ...ticketDocument("T-21"),
        pr: 41,
        prState: "merged",
        prBase: "main",
        lastTransitionedPr: 41,
        stack,
        ignoredBranches: ["feat/T-21-spike"]
      })

      const document = yield* docs.read("acme", "project", "T-21")
      const raw = yield* docs.readRaw("acme", "project", "T-21")

      expect(document).toMatchObject({
        branch: "chore/branch-matching",
        pr: 41,
        prState: "merged",
        prBase: "main",
        lastTransitionedPr: 41,
        stack,
        ignoredBranches: ["feat/T-21-spike"]
      })
      expect(raw.content).toContain(
        [
          "branches:",
          "  - branch: chore/branch-matching",
          "    base: main",
          "    pr: 41",
          "    prState: merged",
          "    landed: true",
          "  - branch: feat/T-21-ui"
        ].join("\n")
      )
      expect(raw.content).toContain("ignoredBranches:\n  - feat/T-21-spike")
      expect(raw.content).not.toMatch(/^(pr|prState|lastTransitionedPr):/m)
    }).pipe(Effect.provide(TestLayer))
  )

  it.effect("writes no git keys for a ticket without a branch", () =>
    Effect.gen(function* () {
      const docs = yield* TicketDocs
      yield* docs.create("acme", "project", {
        ...ticketDocument("T-22"),
        branch: null,
        stack: [],
        ignoredBranches: []
      })

      const raw = yield* docs.readRaw("acme", "project", "T-22")

      expect(raw.content).not.toMatch(
        /^(branches|ignoredBranches|branch|pr|prState|lastTransitionedPr):/m
      )
    }).pipe(Effect.provide(TestLayer))
  )

  it.effect("drops the stack when the ticket's own branch is cleared", () =>
    Effect.gen(function* () {
      const docs = yield* TicketDocs
      yield* docs.create("acme", "project", {
        ...ticketDocument("T-24"),
        branch: null,
        stack: [{ branch: "feat/T-24-ui", base: "feat/T-24" }]
      })

      const document = yield* docs.read("acme", "project", "T-24")
      const raw = yield* docs.readRaw("acme", "project", "T-24")

      expect(document.branch).toBeNull()
      expect(document.stack).toBeUndefined()
      expect(raw.content).not.toMatch(/^branches:/m)
    }).pipe(Effect.provide(TestLayer))
  )

  it.effect("rejects a branches list that repeats a branch", () =>
    Effect.gen(function* () {
      const markdown = yield* Markdown
      const docs = yield* TicketDocs
      yield* markdown.createTicketFile(
        "acme",
        "project",
        "T-25",
        {
          id: "T-25",
          title: "Ticket",
          status: "todo",
          type: "chore",
          priority: "med",
          tags: [],
          branches: [
            { branch: "feat/T-25" },
            { branch: "feat/T-25-ui", base: "feat/T-25" },
            { branch: "feat/T-25-ui", base: "feat/T-25" }
          ],
          assignees: [],
          archivedAt: null,
          createdBy: "user-1",
          createdAt: "2026-09-07T10:00:00Z",
          updatedAt: "2026-09-07T10:00:00Z"
        },
        "# Ticket\n"
      )

      const error = yield* Effect.flip(docs.read("acme", "project", "T-25"))
      expect(error._tag).toBe("MalformedTicketDocument")
    }).pipe(Effect.provide(TestLayer))
  )

  it.effect("reads a ticket file written before the branches list", () =>
    Effect.gen(function* () {
      const markdown = yield* Markdown
      const docs = yield* TicketDocs
      yield* markdown.createTicketFile(
        "acme",
        "project",
        "T-23",
        {
          id: "T-23",
          title: "Ticket",
          status: "todo",
          type: "chore",
          priority: "med",
          tags: [],
          branch: "feat/T-23",
          pr: 7,
          prState: "open",
          prDraft: true,
          lastTransitionedPr: 6,
          assignees: [],
          archivedAt: null,
          createdBy: "user-1",
          createdAt: "2026-09-07T10:00:00Z",
          updatedAt: "2026-09-07T10:00:00Z"
        },
        "# Ticket\n"
      )

      const document = yield* docs.read("acme", "project", "T-23")
      expect(document).toMatchObject({
        branch: "feat/T-23",
        pr: 7,
        prState: "open",
        prDraft: true,
        lastTransitionedPr: 6
      })

      yield* docs.write("acme", "project", "T-23", document)
      const raw = yield* docs.readRaw("acme", "project", "T-23")
      expect(raw.content).toContain(
        "branches:\n  - branch: feat/T-23\n    pr: 7\n    prState: open\n    prDraft: true\n"
      )
      const rewritten = yield* docs.read("acme", "project", "T-23")
      expect(rewritten.lastTransitionedPr).toBeNull()
    }).pipe(Effect.provide(TestLayer))
  )
})

describe("TicketDocs estimate persistence", () => {
  it.effect("writes each estimate unit as a self-describing token", () =>
    Effect.gen(function* () {
      const docs = yield* TicketDocs
      const cases = [
        ["T-11", { unit: "points", value: 5 }, "estimate: 5\n"],
        ["T-12", { unit: "tshirt", value: "M" }, "estimate: M\n"],
        ["T-13", { unit: "time", minutes: 90 }, "estimate: 90m\n"]
      ] as const
      for (const [id, estimate, token] of cases) {
        yield* docs.create("acme", "project", {
          ...ticketDocument(id),
          estimate
        })
        const raw = yield* docs.readRaw("acme", "project", id)
        const document = yield* docs.read("acme", "project", id)
        expect(raw.content).toContain(token)
        expect(document.estimate).toEqual(estimate)
      }
    }).pipe(Effect.provide(TestLayer))
  )

  it.effect("omits the key for an unestimated ticket", () =>
    Effect.gen(function* () {
      const docs = yield* TicketDocs
      yield* docs.create("acme", "project", ticketDocument("T-14"))
      const raw = yield* docs.readRaw("acme", "project", "T-14")
      expect(raw.content).not.toContain("estimate")
    }).pipe(Effect.provide(TestLayer))
  )

  it.effect("reads a hand-written estimate outside the scales as none", () =>
    Effect.gen(function* () {
      const markdown = yield* Markdown
      const docs = yield* TicketDocs
      yield* markdown.createTicketFile(
        "acme",
        "project",
        "T-15",
        {
          id: "T-15",
          title: "Ticket",
          status: "todo",
          type: "chore",
          priority: "med",
          estimate: "XXL",
          tags: [],
          branch: null,
          assignees: [],
          createdBy: "user-1",
          createdAt: "2026-09-07T10:00:00Z",
          updatedAt: "2026-09-07T10:00:00Z"
        },
        "# Ticket\n"
      )
      const document = yield* docs.read("acme", "project", "T-15")
      expect(document.estimate).toBeUndefined()
    }).pipe(Effect.provide(TestLayer))
  )
})

describe("TicketDocs epic parent persistence", () => {
  it.effect(
    "writes the parent into frontmatter and drops it once cleared",
    () =>
      Effect.gen(function* () {
        const docs = yield* TicketDocs
        yield* docs.create("acme", "project", {
          ...ticketDocument("T-16"),
          parent: ticketId("T-1")
        })

        const filed = yield* docs.read("acme", "project", "T-16")
        const filedRaw = yield* docs.readRaw("acme", "project", "T-16")
        yield* docs.write("acme", "project", "T-16", ticketDocument("T-16"))
        const clearedRaw = yield* docs.readRaw("acme", "project", "T-16")

        expect(filed.parent).toBe("T-1")
        expect(filedRaw.content).toContain("parent: T-1")
        expect(clearedRaw.content).not.toContain("parent:")
      }).pipe(Effect.provide(TestLayer))
  )
})

describe("TicketDocs activity capture", () => {
  const later = DateTime.toDate(DateTime.makeUnsafe("2026-09-08T10:00:00Z"))

  const capture = <A, E>(
    run: (docs: TicketDocs["Service"]) => Effect.Effect<A, E, ActivityActor>,
    actor = ActivityActor.user("user-2")
  ) => {
    const recorded: Array<RecordedActivity> = []
    return Effect.gen(function* () {
      const docs = yield* TicketDocs
      yield* docs.create("acme", "project", ticketDocument("T-1"))
      const result = yield* run(docs).pipe(
        Effect.provideService(ActivityActor, actor)
      )
      return { recorded, result }
    }).pipe(Effect.provide(testLayer(recordingTicketActivity(recorded))))
  }

  it.effect("captures estimate-only additions, changes and removals", () =>
    Effect.gen(function* () {
      const initial: Estimate = { unit: "points", value: 3 }
      const changed: Estimate = { unit: "time", minutes: 90 }
      const { recorded } = yield* capture((docs) =>
        Effect.gen(function* () {
          for (const estimate of [
            initial,
            { ...initial },
            changed,
            undefined
          ]) {
            yield* docs.update("acme", "project", "T-1", (ticket) =>
              Effect.succeed({ ...ticket, estimate, updatedAt: later })
            )
          }
        })
      )
      expect(recorded.map((entry) => entry.changes)).toEqual([
        [
          {
            ticketId: "T-1",
            change: { kind: "estimate_changed", from: null, to: initial }
          }
        ],
        [
          {
            ticketId: "T-1",
            change: { kind: "estimate_changed", from: initial, to: changed }
          }
        ],
        [
          {
            ticketId: "T-1",
            change: { kind: "estimate_changed", from: changed, to: null }
          }
        ]
      ])
    })
  )

  it.effect("records the diff as the acting user and stamps updatedBy", () =>
    Effect.gen(function* () {
      const { recorded, result } = yield* capture((docs) =>
        docs.update("acme", "project", "T-1", (ticket) =>
          Effect.succeed({
            ...ticket,
            status: ticketStatus("done"),
            updatedAt: later
          })
        )
      )
      expect(result.updatedBy).toBe("user-2")
      expect(recorded).toEqual([
        {
          document: {
            kind: "ticket",
            id: "T-1",
            content: expect.stringContaining("status: done")
          },
          actor: ActivityActor.user("user-2"),
          cause: null,
          changes: [
            {
              ticketId: "T-1",
              change: { kind: "status_changed", from: "todo", to: "done" }
            }
          ]
        }
      ])
    })
  )

  it.effect("keeps updatedBy for system actors", () =>
    Effect.gen(function* () {
      const { recorded, result } = yield* capture(
        (docs) =>
          docs.update("acme", "project", "T-1", (ticket) =>
            Effect.succeed({
              ...ticket,
              pr: 4,
              prState: "merged" as const,
              updatedAt: later
            })
          ),
        ActivityActor.system("github")
      )
      expect(result.updatedBy).toBe("user-1")
      expect(recorded.map((entry) => entry.actor)).toEqual([
        ActivityActor.system("github")
      ])
    })
  )

  it.effect(
    "records nothing for comment-region writes or unchanged tickets",
    () =>
      Effect.gen(function* () {
        const { recorded, result } = yield* capture((docs) =>
          docs
            .update("acme", "project", "T-1", (ticket) =>
              Effect.succeed({
                ...ticket,
                commentsRegion: "<!-- comments:start -->\n<!-- comments:end -->"
              })
            )
            .pipe(
              Effect.andThen(
                docs.update("acme", "project", "T-1", (ticket) =>
                  Effect.succeed(ticket)
                )
              )
            )
        )
        expect(result.updatedBy).toBe("user-1")
        expect(recorded).toEqual([])
      })
  )

  it.effect("gives status changes their own cause in the same write", () =>
    Effect.gen(function* () {
      const { recorded } = yield* capture((docs) =>
        docs.update(
          "acme",
          "project",
          "T-1",
          (ticket) =>
            Effect.succeed({
              ...ticket,
              status: ticketStatus("done"),
              pr: 42,
              prState: "merged" as const,
              updatedAt: later
            }),
          undefined,
          { statusCause: "git_automation" }
        )
      )
      expect(recorded).toHaveLength(1)
      expect(recorded[0].cause).toBeNull()
      expect(
        recorded[0].changes.map((entry) => [entry.change.kind, entry.cause])
      ).toEqual([
        ["status_changed", "git_automation"],
        ["pr_merged", undefined]
      ])
    })
  )

  it.effect("passes the cause, appends extra changes, and honours silent", () =>
    Effect.gen(function* () {
      const { recorded } = yield* capture((docs) =>
        docs
          .update(
            "acme",
            "project",
            "T-1",
            (ticket) =>
              Effect.succeed({ ...ticket, title: "Renamed", updatedAt: later }),
            undefined,
            {
              cause: "status_removed",
              extra: [{ kind: "split", into: [ticketId("T-2")] }]
            }
          )
          .pipe(
            Effect.andThen(
              docs.update(
                "acme",
                "project",
                "T-1",
                (ticket) =>
                  Effect.succeed({
                    ...ticket,
                    title: "Again",
                    updatedAt: later
                  }),
                undefined,
                { silent: true }
              )
            )
          )
      )
      expect(recorded).toHaveLength(1)
      expect(recorded[0].cause).toBe("status_removed")
      expect(recorded[0].changes.map((entry) => entry.change.kind)).toEqual([
        "title_changed",
        "split"
      ])
    })
  )
})
