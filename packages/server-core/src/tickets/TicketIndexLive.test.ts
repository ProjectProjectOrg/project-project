import { it } from "@effect/vitest"
import { TagName, TicketId, TicketStatus } from "@pp/shared"
import * as DateTime from "effect/DateTime"
import * as Effect from "effect/Effect"
import * as Schema from "effect/Schema"
import { describe, expect } from "vitest"

import type { TicketDocument } from "./TicketDocs"
import type { TicketIndexProject } from "./TicketIndex"
import {
  commentIndexRowsFor,
  detectTicketIndexDrift,
  makeTicketIndexReconciler,
  ticketIndexRowsFor,
  ticketIndexHasDrift,
  type TicketIndexReconcilerDeps
} from "./TicketIndexLive"

const ticketId = Schema.decodeUnknownSync(TicketId)
const ticketStatus = Schema.decodeUnknownSync(TicketStatus)
const tagName = Schema.decodeUnknownSync(TagName)
const at = (iso: string) => DateTime.toDate(DateTime.makeUnsafe(iso))

const project: TicketIndexProject = {
  orgSlug: "acme",
  organizationId: "org-1",
  projectId: "project-1",
  projectSlug: "demo"
}

const doc = (
  id: string,
  updatedAt: string,
  overrides: Partial<TicketDocument> = {}
): TicketDocument => ({
  id: ticketId(id),
  title: `Ticket ${id}`,
  status: ticketStatus("todo"),
  type: "feat",
  priority: "med",
  tags: [],
  branch: null,
  pr: null,
  prState: null,
  lastTransitionedPr: null,
  assignees: [],
  archivedAt: null,
  createdBy: "user-1",
  createdAt: at("2026-05-01T00:00:00.000Z"),
  updatedBy: "user-1",
  updatedAt: at(updatedAt),
  body: "",
  commentsRegion: "",
  ...overrides
})

describe("ticketIndexRowsFor", () => {
  it.effect(
    "normalizes every ticket document into its database insert row",
    () =>
      Effect.sync(() => {
        const tags = [tagName("backend"), tagName("urgent")]
        const assignees = ["user-2", "user-3"]
        const createdAt = at("2026-05-01T01:02:03.000Z")
        const updatedAt = at("2026-05-02T04:05:06.000Z")
        const archivedAt = at("2026-05-03T07:08:09.000Z")
        const document = doc("T-27", updatedAt.toISOString(), {
          title: "Ship pure index builders",
          status: ticketStatus("in_progress"),
          type: "chore",
          priority: "high",
          tags,
          assignees,
          branch: "chore/T-27-index-builders",
          pr: 172,
          prState: "merged",
          lastTransitionedPr: 171,
          archivedAt,
          createdBy: "user-4",
          createdAt,
          updatedAt
        })

        const rows = ticketIndexRowsFor(project, [document])

        expect(rows).toEqual([
          {
            organizationId: "org-1",
            projectId: "project-1",
            ticketId: ticketId("T-27"),
            title: "Ship pure index builders",
            status: ticketStatus("in_progress"),
            type: "chore",
            priority: "high",
            tags: [tagName("backend"), tagName("urgent")],
            assignees: ["user-2", "user-3"],
            branch: "chore/T-27-index-builders",
            pr: 172,
            prState: "merged",
            lastTransitionedPr: 171,
            archivedAt,
            createdBy: "user-4",
            createdAt,
            updatedAt
          }
        ])
        expect(rows[0]!.tags).not.toBe(tags)
        expect(rows[0]!.assignees).not.toBe(assignees)
      })
  )
})

describe("commentIndexRowsFor", () => {
  it.effect(
    "preserves parsed comment ids, attribution, origins, and dates",
    () =>
      Effect.sync(() => {
        const document = doc("T-28", "2026-05-06T00:00:00.000Z", {
          commentsRegion: `<!-- comments:start -->
<!-- comment:legacy-comment -->
---
author: user-1
createdAt: 2026-05-01T01:02:03.000Z
---
Legacy comment
<!-- comment:linked-jira-comment -->
---
author:
  kind: user
  userId: user-2
origin: jira
createdAt: 2026-05-02T02:03:04.000Z
editedAt: 2026-05-03T03:04:05.000Z
---
Linked Jira comment
<!-- comment:snapshot-jira-comment -->
---
author:
  kind: jira
  displayName: Former Jira User
  accountId: jira-account-1
origin: jira
createdAt: 2026-05-04T04:05:06.000Z
---
Snapshot Jira comment
<!-- comment:malformed-comment -->
---
origin: native
createdAt: 2026-05-05T05:06:07.000Z
---
Missing author
<!-- comments:end -->
`
        })

        expect(commentIndexRowsFor(project, [document])).toEqual([
          {
            id: "legacy-comment",
            projectId: "project-1",
            ticketId: ticketId("T-28"),
            origin: "native",
            authorKind: "user",
            authorId: "user-1",
            jiraDisplayName: null,
            jiraAccountId: null,
            createdAt: at("2026-05-01T01:02:03.000Z"),
            editedAt: null
          },
          {
            id: "linked-jira-comment",
            projectId: "project-1",
            ticketId: ticketId("T-28"),
            origin: "jira",
            authorKind: "user",
            authorId: "user-2",
            jiraDisplayName: null,
            jiraAccountId: null,
            createdAt: at("2026-05-02T02:03:04.000Z"),
            editedAt: at("2026-05-03T03:04:05.000Z")
          },
          {
            id: "snapshot-jira-comment",
            projectId: "project-1",
            ticketId: ticketId("T-28"),
            origin: "jira",
            authorKind: "jira",
            authorId: null,
            jiraDisplayName: "Former Jira User",
            jiraAccountId: "jira-account-1",
            createdAt: at("2026-05-04T04:05:06.000Z"),
            editedAt: null
          }
        ])
      })
  )
})

describe("detectTicketIndexDrift", () => {
  it.effect("reports no drift when index matches the documents", () =>
    Effect.sync(() => {
      const drift = detectTicketIndexDrift(
        [
          { ticketId: "T-1", updatedAt: at("2026-05-02T00:00:00.000Z") },
          { ticketId: "T-2", updatedAt: at("2026-05-03T00:00:00.000Z") }
        ],
        [
          { id: "T-1", updatedAt: at("2026-05-02T00:00:00.000Z") },
          { id: "T-2", updatedAt: at("2026-05-03T00:00:00.000Z") }
        ]
      )
      expect(drift).toEqual({ missing: [], orphaned: [], stale: [] })
      expect(ticketIndexHasDrift(drift)).toBe(false)
    })
  )

  it.effect("flags a document with no index row as missing", () =>
    Effect.sync(() => {
      const drift = detectTicketIndexDrift(
        [{ ticketId: "T-1", updatedAt: at("2026-05-02T00:00:00.000Z") }],
        [
          { id: "T-1", updatedAt: at("2026-05-02T00:00:00.000Z") },
          { id: "T-2", updatedAt: at("2026-05-03T00:00:00.000Z") }
        ]
      )
      expect(drift).toEqual({ missing: ["T-2"], orphaned: [], stale: [] })
      expect(ticketIndexHasDrift(drift)).toBe(true)
    })
  )

  it.effect("flags an index row with a mismatched timestamp as stale", () =>
    Effect.sync(() => {
      const drift = detectTicketIndexDrift(
        [{ ticketId: "T-1", updatedAt: at("2026-05-02T00:00:00.000Z") }],
        [{ id: "T-1", updatedAt: at("2026-05-09T00:00:00.000Z") }]
      )
      expect(drift).toEqual({ missing: [], orphaned: [], stale: ["T-1"] })
      expect(ticketIndexHasDrift(drift)).toBe(true)
    })
  )

  it.effect("flags an index row with no backing document as orphaned", () =>
    Effect.sync(() => {
      const drift = detectTicketIndexDrift(
        [
          { ticketId: "T-1", updatedAt: at("2026-05-02T00:00:00.000Z") },
          { ticketId: "T-9", updatedAt: at("2026-05-02T00:00:00.000Z") }
        ],
        [{ id: "T-1", updatedAt: at("2026-05-02T00:00:00.000Z") }]
      )
      expect(drift).toEqual({ missing: [], orphaned: ["T-9"], stale: [] })
      expect(ticketIndexHasDrift(drift)).toBe(true)
    })
  )

  it.effect("reports each drift category together", () =>
    Effect.sync(() => {
      const drift = detectTicketIndexDrift(
        [
          { ticketId: "T-1", updatedAt: at("2026-05-02T00:00:00.000Z") },
          { ticketId: "T-9", updatedAt: at("2026-05-02T00:00:00.000Z") }
        ],
        [
          { id: "T-1", updatedAt: at("2026-05-05T00:00:00.000Z") },
          { id: "T-2", updatedAt: at("2026-05-03T00:00:00.000Z") }
        ]
      )
      expect(drift).toEqual({
        missing: ["T-2"],
        orphaned: ["T-9"],
        stale: ["T-1"]
      })
    })
  )
})

interface Harness {
  readonly deps: TicketIndexReconcilerDeps
  readonly writes: Array<{
    project: TicketIndexProject
    documents: ReadonlyArray<TicketDocument>
  }>
}

const makeHarness = (config: {
  projects?: ReadonlyArray<TicketIndexProject>
  documents: ReadonlyArray<TicketDocument>
  skipped?: number
  indexed: ReadonlyArray<{ ticketId: string; updatedAt: Date }>
}): Harness => {
  const writes: Harness["writes"] = []
  const deps: TicketIndexReconcilerDeps = {
    listProjects: Effect.succeed(config.projects ?? [project]),
    collectDocuments: () =>
      Effect.succeed({
        documents: config.documents,
        skipped: config.skipped ?? 0
      }),
    indexedRefs: () => Effect.succeed(config.indexed),
    writeProject: (writtenProject, documents) =>
      Effect.sync(() => {
        writes.push({ project: writtenProject, documents })
      })
  }
  return { deps, writes }
}

describe("makeTicketIndexReconciler", () => {
  it.effect("does not rebuild a project that has not drifted", () =>
    Effect.gen(function* () {
      const { deps, writes } = makeHarness({
        documents: [doc("T-1", "2026-05-02T00:00:00.000Z")],
        indexed: [
          { ticketId: "T-1", updatedAt: at("2026-05-02T00:00:00.000Z") }
        ]
      })
      const reconciler = makeTicketIndexReconciler(deps)
      const summary = yield* reconciler.reconcileProject(project)
      expect(summary.rebuilt).toBe(false)
      expect(summary.drift).toEqual({ missing: [], orphaned: [], stale: [] })
      expect(summary.indexed).toBe(1)
      expect(writes).toHaveLength(0)
    })
  )

  it.effect("rebuilds from the documents when the index drifted", () =>
    Effect.gen(function* () {
      const documents = [
        doc("T-1", "2026-05-05T00:00:00.000Z"),
        doc("T-2", "2026-05-03T00:00:00.000Z")
      ]
      const { deps, writes } = makeHarness({
        documents,
        skipped: 1,
        indexed: [
          { ticketId: "T-1", updatedAt: at("2026-05-02T00:00:00.000Z") },
          { ticketId: "T-9", updatedAt: at("2026-05-02T00:00:00.000Z") }
        ]
      })
      const reconciler = makeTicketIndexReconciler(deps)
      const summary = yield* reconciler.reconcileProject(project)
      expect(summary.rebuilt).toBe(true)
      expect(summary.drift).toEqual({
        missing: ["T-2"],
        orphaned: ["T-9"],
        stale: ["T-1"]
      })
      expect(summary.indexed).toBe(2)
      expect(summary.skipped).toBe(1)
      expect(writes).toHaveLength(1)
      expect(writes[0].documents).toBe(documents)
    })
  )

  it.effect("force rebuilds even when the project has not drifted", () =>
    Effect.gen(function* () {
      const documents = [doc("T-1", "2026-05-02T00:00:00.000Z")]
      const { deps, writes } = makeHarness({
        documents,
        indexed: [
          { ticketId: "T-1", updatedAt: at("2026-05-02T00:00:00.000Z") }
        ]
      })
      const reconciler = makeTicketIndexReconciler(deps)
      const summary = yield* reconciler.reconcileProject(project, {
        force: true
      })
      expect(summary.rebuilt).toBe(true)
      expect(summary.drift).toEqual({ missing: [], orphaned: [], stale: [] })
      expect(writes).toHaveLength(1)
      expect(writes[0].documents).toBe(documents)
    })
  )

  it.effect("reconcileAllProjects counts only the projects it rebuilt", () =>
    Effect.gen(function* () {
      const projectB: TicketIndexProject = {
        ...project,
        projectId: "project-2",
        projectSlug: "beta"
      }
      const documents = [doc("T-1", "2026-05-02T00:00:00.000Z")]
      const writes: Array<string> = []
      const deps: TicketIndexReconcilerDeps = {
        listProjects: Effect.succeed([project, projectB]),
        collectDocuments: () => Effect.succeed({ documents, skipped: 0 }),
        indexedRefs: (target) =>
          Effect.succeed(
            target.projectId === project.projectId
              ? [{ ticketId: "T-1", updatedAt: at("2026-05-02T00:00:00.000Z") }]
              : []
          ),
        writeProject: (target) =>
          Effect.sync(() => {
            writes.push(target.projectId)
          })
      }
      const reconciler = makeTicketIndexReconciler(deps)
      const summary = yield* reconciler.reconcileAllProjects()
      expect(summary.projects).toHaveLength(2)
      expect(summary.reconciled).toBe(1)
      expect(writes).toEqual(["project-2"])
    })
  )
})
