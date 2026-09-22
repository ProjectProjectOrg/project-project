import * as BunServices from "@effect/platform-bun/BunServices"
import { it } from "@effect/vitest"
import { TicketId, TicketStatus } from "@pp/shared"
import * as ConfigProvider from "effect/ConfigProvider"
import * as DateTime from "effect/DateTime"
import * as Effect from "effect/Effect"
import * as FileSystem from "effect/FileSystem"
import * as Layer from "effect/Layer"
import * as Schema from "effect/Schema"
import { describe, expect } from "vitest"

import { Markdown } from "../markdown/Markdown"
import { MarkdownLive } from "../markdown/MarkdownLive"
import { TicketDocs, type TicketDocument } from "./TicketDocs"
import { TicketDocsLive } from "./TicketDocsLive"

const TestLayer = Layer.unwrap(
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem
    const tmpRoot = yield* fs.makeTempDirectoryScoped({
      prefix: "projectproject-ticket-docs-"
    })
    return TicketDocsLive.pipe(
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
