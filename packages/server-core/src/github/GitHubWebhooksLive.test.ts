import { it, layer } from "@effect/vitest"
import {
  NotFound,
  TicketId,
  TicketStatus,
  type TicketBranchEntry
} from "@pp/shared"
import * as DateTime from "effect/DateTime"
import * as Effect from "effect/Effect"
import * as Schema from "effect/Schema"
import { expect } from "vitest"

import {
  DEFAULT_GIT_AUTOMATION_CONFIG,
  gitAutomationTestService
} from "../projects/gitAutomationTesting"
import { moveForDeletedBranch } from "../tickets/moveByGitAutomation"
import {
  MalformedTicketDocument,
  type TicketDocsShape,
  type TicketDocument
} from "../tickets/TicketDocs"
import * as TicketDocumentLock from "../tickets/ticketDocumentLock"
import type { TicketIndexShape } from "../tickets/TicketIndex"
import type {
  GitHubBranchDeletionChange,
  GitHubCheckWebhookChange,
  GitHubPullRequestWebhookChange,
  GitHubRepositoryMetadataChange,
  GitHubWebhookMutationSink
} from "./GitHubWebhooks"
import {
  applyPullRequestWebhookToLayer,
  applyPullRequestWebhookToTicket,
  landMergesInto,
  linkPullRequestWebhookToTicket,
  makeGitHubWebhooks,
  type PullRequestWebhookMatch
} from "./GitHubWebhooksLive"

type Call =
  | { readonly type: "deleted"; readonly installationId: string }
  | { readonly type: "suspended"; readonly installationId: string }
  | { readonly type: "unsuspended"; readonly installationId: string }
  | {
      readonly type: "reposRemoved"
      readonly installationId: string
      readonly repoIds: ReadonlyArray<string>
    }
  | {
      readonly type: "pullRequestChanged"
      readonly change: GitHubPullRequestWebhookChange
    }
  | {
      readonly type: "repositoryRenamed"
      readonly change: GitHubRepositoryMetadataChange
    }
  | {
      readonly type: "repositoryTransferred"
      readonly change: GitHubRepositoryMetadataChange
    }
  | {
      readonly type: "repositoryArchived"
      readonly installationId: string
      readonly repoId: string
    }
  | {
      readonly type: "repositoryUnarchived"
      readonly installationId: string
      readonly repoId: string
    }
  | {
      readonly type: "repositoryDeleted"
      readonly installationId: string
      readonly repoId: string
    }
  | {
      readonly type: "branchDeleted"
      readonly change: GitHubBranchDeletionChange
    }
  | {
      readonly type: "checkStateChanged"
      readonly change: GitHubCheckWebhookChange
    }

const makeSink = (calls: Array<Call>): GitHubWebhookMutationSink => ({
  installationDeleted: (installationId) =>
    Effect.sync(() => {
      calls.push({ type: "deleted", installationId })
    }),
  installationSuspended: (installationId) =>
    Effect.sync(() => {
      calls.push({ type: "suspended", installationId })
    }),
  installationUnsuspended: (installationId) =>
    Effect.sync(() => {
      calls.push({ type: "unsuspended", installationId })
    }),
  repositoriesRemoved: (installationId, repoIds) =>
    Effect.sync(() => {
      calls.push({ type: "reposRemoved", installationId, repoIds })
    }),
  pullRequestChanged: (change) =>
    Effect.sync(() => {
      calls.push({ type: "pullRequestChanged", change })
    }),
  repositoryRenamed: (change) =>
    Effect.sync(() => {
      calls.push({ type: "repositoryRenamed", change })
    }),
  repositoryTransferred: (change) =>
    Effect.sync(() => {
      calls.push({ type: "repositoryTransferred", change })
    }),
  repositoryArchived: (installationId, repoId) =>
    Effect.sync(() => {
      calls.push({ type: "repositoryArchived", installationId, repoId })
    }),
  repositoryUnarchived: (installationId, repoId) =>
    Effect.sync(() => {
      calls.push({ type: "repositoryUnarchived", installationId, repoId })
    }),
  repositoryDeleted: (installationId, repoId) =>
    Effect.sync(() => {
      calls.push({ type: "repositoryDeleted", installationId, repoId })
    }),
  branchDeleted: (change) =>
    Effect.sync(() => {
      calls.push({ type: "branchDeleted", change })
    }),
  checkStateChanged: (change) =>
    Effect.sync(() => {
      calls.push({ type: "checkStateChanged", change })
    })
})

const delivery = (event: string, body: unknown) => ({
  event,
  deliveryId: "delivery-1",
  body: Schema.encodeSync(Schema.fromJsonString(Schema.Unknown))(body)
})

it.effect("dispatches installation.deleted", () =>
  Effect.gen(function* () {
    const calls: Array<Call> = []
    const webhooks = makeGitHubWebhooks(makeSink(calls))
    yield* webhooks.handle(
      delivery("installation", {
        action: "deleted",
        installation: { id: 123 }
      })
    )
    expect(calls).toEqual([{ type: "deleted", installationId: "123" }])
  })
)

it.effect("dispatches installation.suspend", () =>
  Effect.gen(function* () {
    const calls: Array<Call> = []
    const webhooks = makeGitHubWebhooks(makeSink(calls))
    yield* webhooks.handle(
      delivery("installation", {
        action: "suspend",
        installation: { id: 123 }
      })
    )
    expect(calls).toEqual([{ type: "suspended", installationId: "123" }])
  })
)

it.effect("dispatches installation.unsuspend", () =>
  Effect.gen(function* () {
    const calls: Array<Call> = []
    const webhooks = makeGitHubWebhooks(makeSink(calls))
    yield* webhooks.handle(
      delivery("installation", {
        action: "unsuspend",
        installation: { id: 123 }
      })
    )
    expect(calls).toEqual([{ type: "unsuspended", installationId: "123" }])
  })
)

it.effect("dispatches installation_repositories.removed with repo ids", () =>
  Effect.gen(function* () {
    const calls: Array<Call> = []
    const webhooks = makeGitHubWebhooks(makeSink(calls))
    yield* webhooks.handle(
      delivery("installation_repositories", {
        action: "removed",
        installation: { id: "123" },
        repositories_removed: [{ id: 456 }, { id: "789" }]
      })
    )
    expect(calls).toEqual([
      {
        type: "reposRemoved",
        installationId: "123",
        repoIds: ["456", "789"]
      }
    ])
  })
)

it.effect("dispatches handled pull_request actions", () =>
  Effect.gen(function* () {
    const calls: Array<Call> = []
    const webhooks = makeGitHubWebhooks(makeSink(calls))
    const cases = [
      { action: "opened", merged: false, draft: false, expectedState: "open" },
      { action: "opened", merged: false, draft: true, expectedState: "open" },
      {
        action: "reopened",
        merged: false,
        draft: false,
        expectedState: "open"
      },
      {
        action: "synchronize",
        merged: false,
        draft: false,
        expectedState: "open"
      },
      {
        action: "converted_to_draft",
        merged: false,
        draft: true,
        expectedState: "open"
      },
      {
        action: "ready_for_review",
        merged: false,
        draft: false,
        expectedState: "open"
      },
      {
        action: "closed",
        merged: false,
        draft: false,
        expectedState: "closed"
      },
      { action: "closed", merged: true, draft: false, expectedState: "merged" },
      { action: "edited", merged: false, draft: false, expectedState: "open" },
      {
        action: "edited",
        merged: false,
        draft: false,
        prState: "closed",
        expectedState: "closed"
      },
      {
        action: "edited",
        merged: true,
        draft: false,
        prState: "closed",
        expectedState: "merged"
      }
    ]
    for (const input of cases) {
      yield* webhooks.handle(
        delivery("pull_request", {
          action: input.action,
          installation: { id: "123" },
          repository: { id: "456", default_branch: "main" },
          number: 80,
          pull_request: {
            title: "T-84: PR webhook lifecycle",
            body: null,
            updated_at: "2026-05-01T10:00:00Z",
            state:
              input.prState ?? (input.action === "closed" ? "closed" : "open"),
            merged: input.merged,
            draft: input.draft,
            head: { ref: "feat/T-84-pr-webhook-lifecycle", repo: { id: 456 } },
            base: { ref: "main" }
          }
        })
      )
    }
    expect(calls).toEqual(
      cases.map((input) => ({
        type: "pullRequestChanged",
        change: {
          installationId: "123",
          repositoryId: "456",
          branch: "feat/T-84-pr-webhook-lifecycle",
          number: 80,
          title: "T-84: PR webhook lifecycle",
          body: "",
          updatedAt: DateTime.toDate(
            DateTime.makeUnsafe("2026-05-01T10:00:00Z")
          ),
          mergedAt: null,
          state: input.expectedState,
          draft: input.draft,
          baseBranch: "main",
          defaultBranch: "main"
        }
      }))
    )
  })
)

it.effect("ignores unhandled pull_request actions and fork pull requests", () =>
  Effect.gen(function* () {
    const calls: Array<Call> = []
    const webhooks = makeGitHubWebhooks(makeSink(calls))
    yield* webhooks.handle(
      delivery("pull_request", {
        action: "labeled",
        installation: { id: "123" },
        repository: { id: "456" },
        number: 80,
        pull_request: {
          merged: false,
          head: { ref: "feat/T-84-pr-webhook-lifecycle", repo: { id: 456 } },
          base: { ref: "main" }
        }
      })
    )
    yield* webhooks.handle(
      delivery("pull_request", {
        action: "opened",
        installation: { id: "123" },
        repository: { id: "456" },
        number: 80,
        pull_request: {
          merged: false,
          head: { ref: "feat/T-84-pr-webhook-lifecycle", repo: { id: 999 } },
          base: { ref: "main" }
        }
      })
    )
    expect(calls).toEqual([])
  })
)

it.effect("ignores unhandled events and actions", () =>
  Effect.gen(function* () {
    const calls: Array<Call> = []
    const webhooks = makeGitHubWebhooks(makeSink(calls))
    yield* webhooks.handle(delivery("push", { action: "created" }))
    yield* webhooks.handle(
      delivery("installation", {
        action: "created",
        installation: { id: 123 }
      })
    )
    expect(calls).toEqual([])
  })
)

it.effect("logs and ignores malformed handled payloads", () =>
  Effect.gen(function* () {
    const calls: Array<Call> = []
    const webhooks = makeGitHubWebhooks(makeSink(calls))
    yield* webhooks.handle({
      event: "installation",
      deliveryId: "delivery-1",
      body: "{"
    })
    yield* webhooks.handle(
      delivery("installation_repositories", {
        action: "removed",
        installation: { id: 123 }
      })
    )
    expect(calls).toEqual([])
  })
)

it.effect(
  "dispatches repository.renamed with metadata matched by repo id",
  () =>
    Effect.gen(function* () {
      const calls: Array<Call> = []
      const webhooks = makeGitHubWebhooks(makeSink(calls))
      yield* webhooks.handle(
        delivery("repository", {
          action: "renamed",
          installation: { id: "123" },
          repository: {
            id: 456,
            name: "new-name",
            owner: { login: "acme" },
            default_branch: "main"
          }
        })
      )
      expect(calls).toEqual([
        {
          type: "repositoryRenamed",
          change: {
            installationId: "123",
            repoId: "456",
            owner: "acme",
            name: "new-name",
            defaultBranch: "main"
          }
        }
      ])
    })
)

it.effect("dispatches repository.transferred with metadata", () =>
  Effect.gen(function* () {
    const calls: Array<Call> = []
    const webhooks = makeGitHubWebhooks(makeSink(calls))
    yield* webhooks.handle(
      delivery("repository", {
        action: "transferred",
        installation: { id: 123 },
        repository: {
          id: "456",
          name: "repo",
          owner: { login: "newowner" },
          default_branch: "trunk"
        }
      })
    )
    expect(calls).toEqual([
      {
        type: "repositoryTransferred",
        change: {
          installationId: "123",
          repoId: "456",
          owner: "newowner",
          name: "repo",
          defaultBranch: "trunk"
        }
      }
    ])
  })
)

it.effect(
  "dispatches repository.archived, unarchived and deleted by repo id",
  () =>
    Effect.gen(function* () {
      const calls: Array<Call> = []
      const webhooks = makeGitHubWebhooks(makeSink(calls))
      for (const action of ["archived", "unarchived", "deleted"]) {
        yield* webhooks.handle(
          delivery("repository", {
            action,
            installation: { id: "123" },
            repository: { id: 456 }
          })
        )
      }
      expect(calls).toEqual([
        { type: "repositoryArchived", installationId: "123", repoId: "456" },
        { type: "repositoryUnarchived", installationId: "123", repoId: "456" },
        { type: "repositoryDeleted", installationId: "123", repoId: "456" }
      ])
    })
)

it.effect("ignores unhandled repository actions", () =>
  Effect.gen(function* () {
    const calls: Array<Call> = []
    const webhooks = makeGitHubWebhooks(makeSink(calls))
    for (const action of ["created", "edited", "publicized", "privatized"]) {
      yield* webhooks.handle(
        delivery("repository", {
          action,
          installation: { id: "123" },
          repository: { id: 456 }
        })
      )
    }
    expect(calls).toEqual([])
  })
)

it.effect("ignores repository.renamed missing metadata", () =>
  Effect.gen(function* () {
    const calls: Array<Call> = []
    const webhooks = makeGitHubWebhooks(makeSink(calls))
    yield* webhooks.handle(
      delivery("repository", {
        action: "renamed",
        installation: { id: "123" },
        repository: { id: 456, name: "new-name" }
      })
    )
    expect(calls).toEqual([])
  })
)

it.effect("dispatches delete of a branch ref matched by repo id", () =>
  Effect.gen(function* () {
    const calls: Array<Call> = []
    const webhooks = makeGitHubWebhooks(makeSink(calls))
    yield* webhooks.handle(
      delivery("delete", {
        ref: "feat/T-85-branch-deletion-webhooks",
        ref_type: "branch",
        installation: { id: 123 },
        repository: { id: 456, default_branch: "main" }
      })
    )
    expect(calls).toEqual([
      {
        type: "branchDeleted",
        change: {
          installationId: "123",
          repositoryId: "456",
          branch: "feat/T-85-branch-deletion-webhooks"
        }
      }
    ])
  })
)

it.effect("processes repeated delete deliveries idempotently at the sink", () =>
  Effect.gen(function* () {
    const calls: Array<Call> = []
    const webhooks = makeGitHubWebhooks(makeSink(calls))
    const payload = {
      ref: "feat/T-1",
      ref_type: "branch",
      installation: { id: "123" },
      repository: { id: "456", default_branch: "main" }
    }
    yield* webhooks.handle(delivery("delete", payload))
    yield* webhooks.handle(delivery("delete", payload))
    expect(calls).toEqual([
      {
        type: "branchDeleted",
        change: {
          installationId: "123",
          repositoryId: "456",
          branch: "feat/T-1"
        }
      },
      {
        type: "branchDeleted",
        change: {
          installationId: "123",
          repositoryId: "456",
          branch: "feat/T-1"
        }
      }
    ])
  })
)

it.effect("ignores delete of the default branch and of tag refs", () =>
  Effect.gen(function* () {
    const calls: Array<Call> = []
    const webhooks = makeGitHubWebhooks(makeSink(calls))
    yield* webhooks.handle(
      delivery("delete", {
        ref: "main",
        ref_type: "branch",
        installation: { id: "123" },
        repository: { id: "456", default_branch: "main" }
      })
    )
    yield* webhooks.handle(
      delivery("delete", {
        ref: "v1.0.0",
        ref_type: "tag",
        installation: { id: "123" },
        repository: { id: "456", default_branch: "main" }
      })
    )
    expect(calls).toEqual([])
  })
)

it.effect("logs and ignores malformed delete payloads", () =>
  Effect.gen(function* () {
    const calls: Array<Call> = []
    const webhooks = makeGitHubWebhooks(makeSink(calls))
    yield* webhooks.handle(
      delivery("delete", {
        ref_type: "branch",
        installation: { id: "123" },
        repository: { id: "456" }
      })
    )
    expect(calls).toEqual([])
  })
)

it.effect("maps check_suite status and conclusion to check state", () =>
  Effect.gen(function* () {
    const calls: Array<Call> = []
    const webhooks = makeGitHubWebhooks(makeSink(calls))
    const cases = [
      { status: "completed", conclusion: "success", checks: "passing" },
      { status: "completed", conclusion: "failure", checks: "failing" },
      { status: "completed", conclusion: "timed_out", checks: "failing" },
      { status: "completed", conclusion: "neutral", checks: "neutral" },
      { status: "completed", conclusion: "cancelled", checks: "neutral" },
      { status: "completed", conclusion: null, checks: "neutral" },
      { status: "queued", conclusion: null, checks: "pending" },
      { status: "in_progress", conclusion: null, checks: "pending" }
    ] as const
    for (const input of cases) {
      yield* webhooks.handle(
        delivery("check_suite", {
          action: input.status === "completed" ? "completed" : "requested",
          installation: { id: "123" },
          repository: { id: "456" },
          check_suite: {
            head_branch: "feat/T-83-check-status-webhooks",
            head_sha: "sha-1",
            status: input.status,
            conclusion: input.conclusion,
            updated_at: "2026-07-04T10:00:00.000Z"
          }
        })
      )
    }
    expect(calls).toEqual(
      cases.map((input) => ({
        type: "checkStateChanged",
        change: {
          installationId: "123",
          repositoryId: "456",
          branch: "feat/T-83-check-status-webhooks",
          headSha: "sha-1",
          checks: input.checks,
          updatedAt: DateTime.toDate(
            DateTime.makeUnsafe("2026-07-04T10:00:00.000Z")
          )
        }
      }))
    )
  })
)

it.effect("ignores check_suite deliveries without a head branch", () =>
  Effect.gen(function* () {
    const calls: Array<Call> = []
    const webhooks = makeGitHubWebhooks(makeSink(calls))
    yield* webhooks.handle(
      delivery("check_suite", {
        action: "completed",
        installation: { id: "123" },
        repository: { id: "456" },
        check_suite: {
          head_branch: null,
          head_sha: "sha-1",
          status: "completed",
          conclusion: "success",
          updated_at: "2026-07-04T10:00:00.000Z"
        }
      })
    )
    expect(calls).toEqual([])
  })
)

it.effect(
  "dispatches commit status state as check state for branch heads",
  () =>
    Effect.gen(function* () {
      const calls: Array<Call> = []
      const webhooks = makeGitHubWebhooks(makeSink(calls))
      const cases = [
        { state: "success", checks: "passing" },
        { state: "failure", checks: "failing" },
        { state: "error", checks: "failing" },
        { state: "pending", checks: "pending" }
      ] as const
      for (const input of cases) {
        yield* webhooks.handle(
          delivery("status", {
            installation: { id: "123" },
            repository: { id: "456" },
            sha: "sha-1",
            state: input.state,
            updated_at: "2026-07-04T10:00:00.000Z",
            branches: [
              {
                name: "feat/T-83-check-status-webhooks",
                commit: { sha: "sha-1" }
              },
              { name: "main", commit: { sha: "other-sha" } }
            ]
          })
        )
      }
      expect(calls).toEqual(
        cases.map((input) => ({
          type: "checkStateChanged",
          change: {
            installationId: "123",
            repositoryId: "456",
            branch: "feat/T-83-check-status-webhooks",
            headSha: "sha-1",
            checks: input.checks,
            updatedAt: DateTime.toDate(
              DateTime.makeUnsafe("2026-07-04T10:00:00.000Z")
            )
          }
        }))
      )
    })
)

it.effect("ignores commit status for commits that are not a branch head", () =>
  Effect.gen(function* () {
    const calls: Array<Call> = []
    const webhooks = makeGitHubWebhooks(makeSink(calls))
    yield* webhooks.handle(
      delivery("status", {
        installation: { id: "123" },
        repository: { id: "456" },
        sha: "sha-1",
        state: "success",
        updated_at: "2026-07-04T10:00:00.000Z",
        branches: [{ name: "main", commit: { sha: "other-sha" } }]
      })
    )
    expect(calls).toEqual([])
  })
)

it.effect("ignores check_run events and unknown commit status states", () =>
  Effect.gen(function* () {
    const calls: Array<Call> = []
    const webhooks = makeGitHubWebhooks(makeSink(calls))
    yield* webhooks.handle(
      delivery("check_run", {
        action: "completed",
        installation: { id: "123" },
        repository: { id: "456" }
      })
    )
    yield* webhooks.handle(
      delivery("status", {
        installation: { id: "123" },
        repository: { id: "456" },
        sha: "sha-1",
        state: "unknown",
        updated_at: "2026-07-04T10:00:00.000Z",
        branches: [
          { name: "feat/T-83-check-status-webhooks", commit: { sha: "sha-1" } }
        ]
      })
    )
    expect(calls).toEqual([])
  })
)

it.effect("logs and ignores malformed check payloads", () =>
  Effect.gen(function* () {
    const calls: Array<Call> = []
    const webhooks = makeGitHubWebhooks(makeSink(calls))
    yield* webhooks.handle(
      delivery("check_suite", {
        action: "completed",
        installation: { id: "123" },
        repository: { id: "456" }
      })
    )
    yield* webhooks.handle(
      delivery("status", {
        installation: { id: "123" },
        repository: { id: "456" },
        state: "success"
      })
    )
    expect(calls).toEqual([])
  })
)

const ticketId = Schema.decodeUnknownSync(TicketId)
const ticketStatus = Schema.decodeUnknownSync(TicketStatus)

const baseDocument = (
  overrides: Partial<TicketDocument> = {}
): TicketDocument => ({
  id: ticketId("T-1"),
  title: "first",
  status: ticketStatus("in_progress"),
  type: "feat",
  priority: "med",
  tags: [],
  branch: "feat/T-1",
  pr: null,
  prState: null,
  lastTransitionedPr: null,
  assignees: [],
  archivedAt: null,
  createdBy: "user-1",
  createdAt: DateTime.toDate(DateTime.makeUnsafe("2026-05-01T00:00:00.000Z")),
  updatedBy: "user-1",
  updatedAt: DateTime.toDate(DateTime.makeUnsafe("2026-05-01T00:00:00.000Z")),
  body: "",
  commentsRegion: "",
  ...overrides
})

const baseMatch = (
  overrides: Partial<PullRequestWebhookMatch> = {}
): PullRequestWebhookMatch => ({
  orgSlug: "org",
  organizationId: "org-1",
  projectId: "project-1",
  projectSlug: "p",
  ticketId: "T-1",
  branch: "feat/T-1",
  ...overrides
})

const makeFakeDocs = (initial: ReadonlyArray<TicketDocument>) => {
  const documents = new Map(initial.map((doc) => [doc.id as string, doc]))
  const writes: Array<{ id: string; document: TicketDocument }> = []
  const reads: Array<string> = []
  const shape: TicketDocsShape = {
    listIds: () =>
      Effect.succeed([...documents.keys()].map((id) => ticketId(id))),
    read: (_org, _slug, id) => {
      reads.push(id)
      const doc = documents.get(id)
      return doc ? Effect.succeed(doc) : Effect.fail(new NotFound())
    },
    create: () => Effect.die(new Error("unexpected TicketDocs.create call")),
    write: (_org, _slug, id, document) =>
      Effect.sync(() => {
        documents.set(id, document)
        writes.push({ id, document })
      }),
    update: (_org, _slug, id, transform, onPersist) => {
      reads.push(id)
      const document = documents.get(id)
      if (!document) return Effect.fail(new NotFound())
      return transform(document).pipe(
        Effect.tap((next) =>
          next === document
            ? Effect.void
            : Effect.sync(() => {
                documents.set(id, next)
                writes.push({ id, document: next })
              })
        ),
        Effect.tap((next) => (onPersist ? onPersist(next) : Effect.void))
      )
    },
    remove: () => Effect.die(new Error("unexpected TicketDocs.remove call")),
    readRaw: () => Effect.die(new Error("unexpected TicketDocs.readRaw call"))
  }
  return { documents, writes, reads, shape }
}

const makeFakeIndex = (overrides: Partial<TicketIndexShape> = {}) => {
  const upserts: Array<{ projectId: string; ticketId: string }> = []
  const shape: TicketIndexShape = {
    projectsFor: () => Effect.succeed([]),
    assignedTo: () => Effect.succeed([]),
    touchedBy: () => Effect.succeed([]),
    countAssignedByStatus: () => Effect.succeed([]),
    assignedPerProject: () => Effect.succeed([]),
    projectFor: () =>
      Effect.die(new Error("unexpected TicketIndex.projectFor call")),
    list: () => Effect.succeed([]),
    query: () => Effect.succeed([]),
    querySections: () => Effect.succeed(new Map()),
    orderKeyFor: () => Effect.succeed(null),
    count: () => Effect.succeed({ total: 0, byStatus: {} }),
    listIds: () => Effect.succeed([]),
    existingIds: () => Effect.succeed(new Set()),
    reserveTicketNumber: () => Effect.succeed(1),
    tagUsageCounts: () => Effect.succeed({}),
    findTicketIdsByTag: () => Effect.succeed([]),
    findTicketIdsByStatus: () => Effect.succeed([]),
    findTicketsByBranch: () => Effect.succeed([]),
    findStackLayers: () => Effect.succeed([]),
    stacksFor: () => Effect.succeed(new Map()),
    findMergesAwaiting: () => Effect.succeed([]),
    isRepositoryBranchAttached: () => Effect.succeed(false),
    getBranchDeletedAt: () => Effect.succeed(null),
    upsertTicket: (project, document) =>
      Effect.sync(() => {
        upserts.push({ projectId: project.projectId, ticketId: document.id })
      }),
    markBranchStale: () => Effect.succeed([]),
    clearBranchStale: () => Effect.void,
    updateBranchChecks: () => Effect.succeed([]),
    deleteTicket: () => Effect.void,
    rebuildProject: () =>
      Effect.die(new Error("unexpected TicketIndex.rebuildProject call")),
    rebuildAllProjects: () =>
      Effect.die(new Error("unexpected TicketIndex.rebuildAllProjects call")),
    reconcileProject: () =>
      Effect.die(new Error("unexpected TicketIndex.reconcileProject call")),
    reconcileAllProjects: () =>
      Effect.die(new Error("unexpected TicketIndex.reconcileAllProjects call")),
    ...overrides
  }
  return { upserts, shape }
}

const openChange: GitHubPullRequestWebhookChange = {
  installationId: "123",
  repositoryId: "456",
  branch: "feat/T-1",
  number: 80,
  title: "First",
  body: "",
  state: "open",
  draft: false,
  updatedAt: null,
  baseBranch: "main",
  defaultBranch: "main"
}

layer(TicketDocumentLock.layer)("pull request webhooks", (it) => {
  it.effect(
    "applyPullRequestWebhookToTicket writes markdown and upserts the index on opened",
    () =>
      Effect.gen(function* () {
        const docs = makeFakeDocs([baseDocument()])
        const index = makeFakeIndex()

        yield* applyPullRequestWebhookToTicket(
          {
            ticketDocs: docs.shape,
            ticketIndex: index.shape,
            ticketDocumentLock: yield* TicketDocumentLock.TicketDocumentLock,
            gitAutomation: gitAutomationTestService()
          },
          baseMatch(),
          openChange,
          "delivery-1"
        )

        expect(docs.writes).toHaveLength(1)
        expect(docs.writes[0].document.pr).toBe(80)
        expect(docs.writes[0].document.prState).toBe("open")
        expect(docs.writes[0].document.status).toBe("in_progress")
        expect(index.upserts).toEqual([
          { projectId: "project-1", ticketId: "T-1" }
        ])
      })
  )

  it.effect(
    "applyPullRequestWebhookToTicket propagates index write failures",
    () =>
      Effect.gen(function* () {
        const docs = makeFakeDocs([baseDocument()])
        const index = makeFakeIndex({
          getBranchDeletedAt: () => Effect.succeed(null),
          upsertTicket: () => Effect.die(new Error("index failed"))
        })

        const exit = yield* applyPullRequestWebhookToTicket(
          {
            ticketDocs: docs.shape,
            ticketIndex: index.shape,
            ticketDocumentLock: yield* TicketDocumentLock.TicketDocumentLock,
            gitAutomation: gitAutomationTestService()
          },
          baseMatch(),
          openChange,
          "delivery-1"
        ).pipe(Effect.exit)

        expect(exit._tag).toBe("Failure")
        expect(docs.writes).toHaveLength(1)
      })
  )

  it.effect(
    "applyPullRequestWebhookToTicket serializes same-ticket deliveries",
    () =>
      Effect.gen(function* () {
        const docs = makeFakeDocs([baseDocument()])
        const index = makeFakeIndex()
        let activeUpdates = 0
        let maxActiveUpdates = 0
        const serialDocs: TicketDocsShape = {
          ...docs.shape,
          update: (org, slug, id, transform, onPersist) =>
            Effect.gen(function* () {
              activeUpdates += 1
              maxActiveUpdates = Math.max(maxActiveUpdates, activeUpdates)
              yield* Effect.yieldNow
              return yield* docs.shape.update(
                org,
                slug,
                id,
                transform,
                onPersist
              )
            }).pipe(
              Effect.ensuring(
                Effect.sync(() => {
                  activeUpdates -= 1
                })
              )
            )
        }

        yield* Effect.all(
          [
            applyPullRequestWebhookToTicket(
              {
                ticketDocs: serialDocs,
                ticketIndex: index.shape,
                ticketDocumentLock:
                  yield* TicketDocumentLock.TicketDocumentLock,
                gitAutomation: gitAutomationTestService()
              },
              baseMatch(),
              openChange,
              "delivery-1"
            ),
            applyPullRequestWebhookToTicket(
              {
                ticketDocs: serialDocs,
                ticketIndex: index.shape,
                ticketDocumentLock:
                  yield* TicketDocumentLock.TicketDocumentLock,
                gitAutomation: gitAutomationTestService()
              },
              baseMatch(),
              openChange,
              "delivery-2"
            )
          ],
          { concurrency: "unbounded" }
        )

        expect(maxActiveUpdates).toBe(1)
        expect(docs.writes).toHaveLength(1)
        expect(index.upserts).toHaveLength(1)
      })
  )

  it.effect(
    "applyPullRequestWebhookToTicket skips when ticket markdown branch no longer matches the index row",
    () =>
      Effect.gen(function* () {
        const docs = makeFakeDocs([
          baseDocument({ branch: "feat/T-1-renamed" })
        ])
        const index = makeFakeIndex()

        yield* applyPullRequestWebhookToTicket(
          {
            ticketDocs: docs.shape,
            ticketIndex: index.shape,
            ticketDocumentLock: yield* TicketDocumentLock.TicketDocumentLock,
            gitAutomation: gitAutomationTestService()
          },
          baseMatch({ branch: "feat/T-1" }),
          openChange,
          "delivery-1"
        )

        expect(docs.writes).toEqual([])
        expect(index.upserts).toEqual([])
      })
  )

  it.effect(
    "applyPullRequestWebhookToTicket skips when markdown is malformed",
    () =>
      Effect.gen(function* () {
        const docs = makeFakeDocs([])
        const index = makeFakeIndex()
        const malformedDocs: TicketDocsShape = {
          ...docs.shape,
          read: () =>
            Effect.fail(
              new MalformedTicketDocument({
                orgSlug: "org",
                slug: "p",
                ticketId: "T-1",
                path: "orgs/org/projects/p/tickets/T-1.md",
                reason: "invalid_frontmatter",
                cause: "boom"
              })
            )
        }

        yield* applyPullRequestWebhookToTicket(
          {
            ticketDocs: malformedDocs,
            ticketIndex: index.shape,
            ticketDocumentLock: yield* TicketDocumentLock.TicketDocumentLock,
            gitAutomation: gitAutomationTestService()
          },
          baseMatch(),
          openChange,
          "delivery-1"
        )

        expect(docs.writes).toEqual([])
        expect(index.upserts).toEqual([])
      })
  )

  it.effect(
    "applyPullRequestWebhookToTicket drops a webhook for an older PR number",
    () =>
      Effect.gen(function* () {
        const docs = makeFakeDocs([baseDocument({ pr: 81, prState: "open" })])
        const index = makeFakeIndex()

        yield* applyPullRequestWebhookToTicket(
          {
            ticketDocs: docs.shape,
            ticketIndex: index.shape,
            ticketDocumentLock: yield* TicketDocumentLock.TicketDocumentLock,
            gitAutomation: gitAutomationTestService()
          },
          baseMatch(),
          { ...openChange, number: 80 },
          "delivery-1"
        )

        expect(docs.writes).toEqual([])
        expect(index.upserts).toEqual([])
      })
  )

  it.effect(
    "applyPullRequestWebhookToTicket moves the ticket by the merge rule in the same write, once",
    () =>
      Effect.gen(function* () {
        const docs = makeFakeDocs([baseDocument()])
        const index = makeFakeIndex()

        yield* applyPullRequestWebhookToTicket(
          {
            ticketDocs: docs.shape,
            ticketIndex: index.shape,
            ticketDocumentLock: yield* TicketDocumentLock.TicketDocumentLock,
            gitAutomation: gitAutomationTestService()
          },
          baseMatch(),
          { ...openChange, state: "merged" },
          "delivery-1"
        )

        expect(docs.writes).toHaveLength(1)
        expect(docs.writes[0].document).toMatchObject({
          status: "done",
          prState: "merged",
          lastTransitionedPr: 80
        })

        yield* applyPullRequestWebhookToTicket(
          {
            ticketDocs: docs.shape,
            ticketIndex: index.shape,
            ticketDocumentLock: yield* TicketDocumentLock.TicketDocumentLock,
            gitAutomation: gitAutomationTestService()
          },
          baseMatch(),
          { ...openChange, state: "merged" },
          "delivery-2"
        )

        expect(docs.writes).toHaveLength(1)
        expect(index.upserts).toHaveLength(1)
      })
  )

  it.effect(
    "applyPullRequestWebhookToTicket leaves the status alone for a merge into another branch",
    () =>
      Effect.gen(function* () {
        const docs = makeFakeDocs([baseDocument()])
        const index = makeFakeIndex()

        yield* applyPullRequestWebhookToTicket(
          {
            ticketDocs: docs.shape,
            ticketIndex: index.shape,
            ticketDocumentLock: yield* TicketDocumentLock.TicketDocumentLock,
            gitAutomation: gitAutomationTestService()
          },
          baseMatch(),
          { ...openChange, state: "merged", baseBranch: "feat/stack-base" },
          "delivery-1"
        )

        expect(docs.writes).toHaveLength(1)
        expect(docs.writes[0].document).toMatchObject({
          status: "in_progress",
          prState: "merged"
        })
      })
  )

  it.effect(
    "moveForDeletedBranch moves only tickets still on the deleted branch",
    () =>
      Effect.gen(function* () {
        const docs = makeFakeDocs([
          baseDocument(),
          baseDocument({ id: ticketId("T-2"), branch: "feat/T-2" })
        ])
        const deps = {
          ticketDocs: docs.shape,
          ticketIndex: makeFakeIndex().shape,
          ticketDocumentLock: yield* TicketDocumentLock.TicketDocumentLock,
          gitAutomation: gitAutomationTestService({
            ...DEFAULT_GIT_AUTOMATION_CONFIG,
            rules: {
              ...DEFAULT_GIT_AUTOMATION_CONFIG.rules,
              branch_deleted: ticketStatus("blocked")
            }
          })
        }

        yield* Effect.forEach(
          [
            baseMatch(),
            baseMatch({ ticketId: "T-2" }),
            baseMatch({ ticketId: "T-3" })
          ],
          (match) => moveForDeletedBranch(deps, match)
        )

        expect(docs.writes).toEqual([
          {
            id: "T-1",
            document: expect.objectContaining({ status: "blocked" })
          }
        ])
      })
  )

  const project = {
    orgSlug: "org",
    organizationId: "org-1",
    projectId: "project-1",
    projectSlug: "p"
  }

  const linkPullRequest = (
    documents: ReadonlyArray<TicketDocument>,
    change: Partial<GitHubPullRequestWebhookChange>,
    indexOverrides: Partial<TicketIndexShape> = {}
  ) =>
    Effect.gen(function* () {
      const docs = makeFakeDocs(documents)
      const index = makeFakeIndex({
        existingIds: (_project, ids) =>
          Effect.succeed(new Set(ids.filter((id) => docs.documents.has(id)))),
        ...indexOverrides
      })
      yield* linkPullRequestWebhookToTicket(
        {
          ticketDocs: docs.shape,
          ticketIndex: index.shape,
          ticketDocumentLock: yield* TicketDocumentLock.TicketDocumentLock,
          gitAutomation: gitAutomationTestService()
        },
        project,
        { ...openChange, branch: "fix-login", title: "Fix login", ...change },
        "delivery-1"
      )
      return docs
    })

  const unlinked = (overrides: Partial<TicketDocument> = {}) =>
    baseDocument({ branch: null, ...overrides })

  for (const { name, change } of [
    { name: "its branch name", change: { branch: "feat/T-1-login" } },
    { name: "its title", change: { title: "T-1: fix login" } },
    {
      name: "a closing keyword in its description",
      change: { body: "Login was broken.\n\nFixes T-1" }
    },
    {
      name: "its title when the branch names a key that isn't a ticket",
      change: { branch: "fix-utf-8", title: "[T-1] Handle UTF-8 names" }
    }
  ]) {
    it.effect(`links a pull request to the ticket named in ${name}`, () =>
      Effect.gen(function* () {
        const docs = yield* linkPullRequest([unlinked()], change)

        expect(docs.writes).toEqual([
          {
            id: "T-1",
            document: expect.objectContaining({
              branch: change.branch ?? "fix-login",
              pr: 80,
              prState: "open",
              prDraft: false,
              status: "in_progress"
            })
          }
        ])
      })
    )
  }

  for (const { name, documents, change, indexOverrides } of [
    {
      name: "a closed pull request",
      documents: [unlinked()],
      change: { title: "T-1: fix login", state: "closed" as const }
    },
    {
      name: "a pull request from the default branch",
      documents: [unlinked()],
      change: { branch: "main", title: "T-1: fix login" }
    },
    {
      name: "a title naming two tickets",
      documents: [unlinked(), unlinked({ id: ticketId("T-2") })],
      change: { title: "T-1 and T-2: fix login" }
    },
    {
      name: "a description mentioning a ticket without a closing keyword",
      documents: [unlinked()],
      change: { body: "Related to T-1" }
    },
    {
      name: "a ticket the project doesn't have",
      documents: [unlinked()],
      change: { title: "T-9: fix login" }
    },
    {
      name: "a ticket that already has a branch",
      documents: [baseDocument({ branch: "feat/T-1-other" })],
      change: { title: "T-1: fix login" }
    },
    {
      name: "an archived ticket",
      documents: [
        unlinked({
          archivedAt: DateTime.toDate(
            DateTime.makeUnsafe("2026-05-02T00:00:00.000Z")
          )
        })
      ],
      change: { title: "T-1: fix login" }
    },
    {
      name: "a ticket whose branch was cleared by hand",
      documents: [unlinked({ branchAutoLinkDisabled: true })],
      change: { title: "T-1: fix login" }
    },
    {
      name: "a branch the ticket ignores",
      documents: [unlinked({ ignoredBranches: ["fix-login"] })],
      change: { title: "T-1: fix login" }
    },
    {
      name: "a branch another ticket in the repository has",
      documents: [unlinked()],
      change: { title: "T-1: fix login" },
      indexOverrides: {
        isRepositoryBranchAttached: () => Effect.succeed(true)
      }
    }
  ]) {
    it.effect(`doesn't link ${name}`, () =>
      Effect.gen(function* () {
        const docs = yield* linkPullRequest(documents, change, indexOverrides)

        expect(docs.writes).toEqual([])
      })
    )
  }

  it.effect(
    "moves a ticket linked by a merged pull request by the merge rule",
    () =>
      Effect.gen(function* () {
        const docs = yield* linkPullRequest([unlinked()], {
          title: "T-1: fix login",
          state: "merged"
        })

        expect(docs.writes.map(({ document }) => document)).toEqual([
          expect.objectContaining({
            branch: "fix-login",
            prState: "merged",
            lastTransitionedPr: 80,
            status: "done"
          })
        ])
      })
  )

  for (const { name, change } of [
    {
      name: "builds on the ticket's branch",
      change: {
        branch: "ui-work",
        baseBranch: "feat/T-1",
        title: "T-1: checkout UI"
      }
    },
    {
      name: "names the ticket in its branch",
      change: { branch: "feat/T-1-ui", baseBranch: "main" }
    },
    {
      name: "builds on a branch already stacked on the ticket",
      change: {
        branch: "polish",
        baseBranch: "feat/T-1-api",
        body: "Fixes T-1"
      }
    }
  ]) {
    it.effect(`stacks a pull request that ${name}`, () =>
      Effect.gen(function* () {
        const docs = yield* linkPullRequest(
          [
            baseDocument({
              stack: [{ branch: "feat/T-1-api", base: "feat/T-1" }]
            })
          ],
          change
        )

        expect(docs.writes).toHaveLength(1)
        expect(docs.writes[0]?.document).toMatchObject({
          branch: "feat/T-1",
          pr: null
        })
        expect(docs.writes[0]?.document.stack?.at(-1)).toEqual({
          branch: change.branch,
          base: change.baseBranch,
          pr: 80,
          prState: "open"
        })
      })
    )
  }

  for (const { name, document, change } of [
    {
      name: "a pull request into the default branch named only in its title",
      document: baseDocument(),
      change: { branch: "ui-work", title: "T-1: checkout UI" }
    },
    {
      name: "an ignored branch",
      document: baseDocument({ ignoredBranches: ["feat/T-1-spike"] }),
      change: { branch: "feat/T-1-spike" }
    },
    {
      name: "a pull request on an archived ticket",
      document: baseDocument({
        archivedAt: DateTime.toDate(
          DateTime.makeUnsafe("2026-05-02T00:00:00.000Z")
        )
      }),
      change: { branch: "feat/T-1-ui" }
    }
  ]) {
    it.effect(`doesn't stack ${name}`, () =>
      Effect.gen(function* () {
        const docs = yield* linkPullRequest([document], change)

        expect(docs.writes).toEqual([])
      })
    )
  }

  const stackedMatch = baseMatch({ branch: "feat/T-1-ui" })
  const stackedChange: GitHubPullRequestWebhookChange = {
    ...openChange,
    branch: "feat/T-1-ui",
    baseBranch: "feat/T-1",
    number: 81
  }
  const stackedTicket = (layer: TicketBranchEntry) =>
    baseDocument({ stack: [{ branch: "feat/T-1-docs" }, layer] })

  const applyToLayer = (
    document: TicketDocument,
    change: GitHubPullRequestWebhookChange,
    match: PullRequestWebhookMatch = stackedMatch
  ) =>
    Effect.gen(function* () {
      const docs = makeFakeDocs([document])
      yield* applyPullRequestWebhookToLayer(
        {
          ticketDocs: docs.shape,
          ticketIndex: makeFakeIndex().shape,
          ticketDocumentLock: yield* TicketDocumentLock.TicketDocumentLock,
          gitAutomation: gitAutomationTestService()
        },
        match,
        change,
        "delivery-1"
      )
      return docs
    })

  it.effect("updates a stacked branch to its pull request's state", () =>
    Effect.gen(function* () {
      const docs = yield* applyToLayer(
        stackedTicket({ branch: "feat/T-1-ui" }),
        { ...stackedChange, state: "merged" }
      )

      expect(docs.writes.map(({ document }) => document.stack)).toEqual([
        [
          { branch: "feat/T-1-docs" },
          {
            branch: "feat/T-1-ui",
            base: "feat/T-1",
            pr: 81,
            prState: "merged"
          }
        ]
      ])
      expect(docs.writes[0]?.document).toMatchObject({
        status: "in_progress",
        pr: null
      })
    })
  )

  for (const { name, document, change, match } of [
    {
      name: "a delivery for an older pull request",
      document: stackedTicket({
        branch: "feat/T-1-ui",
        pr: 82,
        prState: "open"
      }),
      change: stackedChange,
      match: stackedMatch
    },
    {
      name: "a reopen event after the merge was recorded",
      document: stackedTicket({
        branch: "feat/T-1-ui",
        base: "feat/T-1",
        pr: 81,
        prState: "merged"
      }),
      change: stackedChange,
      match: stackedMatch
    },
    {
      name: "the state it already has",
      document: stackedTicket({
        branch: "feat/T-1-ui",
        base: "feat/T-1",
        pr: 81,
        prState: "open"
      }),
      change: stackedChange,
      match: stackedMatch
    },
    {
      name: "a branch the ticket no longer stacks",
      document: baseDocument(),
      change: stackedChange,
      match: stackedMatch
    }
  ]) {
    it.effect(`leaves a stacked branch alone for ${name}`, () =>
      Effect.gen(function* () {
        const docs = yield* applyToLayer(document, change, match)

        expect(docs.writes).toEqual([])
      })
    )
  }

  it.effect(
    "records the target of the ticket's own pull request, including a retarget",
    () =>
      Effect.gen(function* () {
        const docs = makeFakeDocs([baseDocument()])
        const deps = {
          ticketDocs: docs.shape,
          ticketIndex: makeFakeIndex().shape,
          ticketDocumentLock: yield* TicketDocumentLock.TicketDocumentLock,
          gitAutomation: gitAutomationTestService()
        }

        yield* applyPullRequestWebhookToTicket(
          deps,
          baseMatch(),
          { ...openChange, baseBranch: "feat/T-0" },
          "delivery-1"
        )
        yield* applyPullRequestWebhookToTicket(
          deps,
          baseMatch(),
          openChange,
          "delivery-2"
        )
        yield* applyPullRequestWebhookToTicket(
          deps,
          baseMatch(),
          openChange,
          "delivery-3"
        )

        expect(
          docs.writes.map(({ document }) => [document.pr, document.prBase])
        ).toEqual([
          [80, "feat/T-0"],
          [80, "main"]
        ])
      })
  )

  it.effect("stacked PR deliveries honor the ordering claim", () =>
    Effect.gen(function* () {
      const docs = makeFakeDocs([
        baseDocument({
          stack: [{ branch: "ui", base: "feat/T-1", pr: 81, prState: "open" }]
        })
      ])
      const index = makeFakeIndex()
      yield* applyPullRequestWebhookToLayer(
        {
          ticketDocs: docs.shape,
          ticketIndex: index.shape,
          ticketDocumentLock: yield* TicketDocumentLock.TicketDocumentLock,
          gitAutomation: gitAutomationTestService(),
          claimPullRequest: () => Effect.succeed(false)
        },
        baseMatch({ branch: "ui" }),
        { ...openChange, branch: "ui", number: 81, state: "closed" },
        "old-delivery"
      )
      expect(docs.documents.get("T-1")?.stack).toEqual([
        { branch: "ui", base: "feat/T-1", pr: 81, prState: "open" }
      ])
      expect(docs.writes).toEqual([])
    })
  )

  it.effect(
    "landMergesInto lands merges waiting on a branch, up stacks and across tickets",
    () =>
      Effect.gen(function* () {
        const docs = makeFakeDocs([
          baseDocument({
            id: ticketId("T-2"),
            branch: "api",
            pr: 20,
            prState: "merged",
            prBase: "feat/base",
            stack: [
              { branch: "ui", base: "api", pr: 21, prState: "merged" },
              { branch: "docs", base: "api", pr: 22, prState: "open" }
            ]
          }),
          baseDocument({
            id: ticketId("T-3"),
            branch: "polish",
            pr: 30,
            prState: "merged",
            prBase: "ui"
          }),
          baseDocument({
            id: ticketId("T-4"),
            branch: "elsewhere",
            pr: 40,
            prState: "merged",
            prBase: "other"
          }),
          ...[50, 60, 70].map((pr) =>
            baseDocument({
              id: ticketId(`T-${pr}`),
              branch: `late-${pr}`,
              pr,
              prState: "merged",
              prBase: "feat/base"
            })
          )
        ])
        const awaiting = (base: string) =>
          [...docs.documents.values()].flatMap((document) => [
            ...(document.prBase === base &&
            document.prState === "merged" &&
            document.branch !== null &&
            document.lastTransitionedPr !== document.pr
              ? [
                  {
                    ...baseMatch({
                      ticketId: document.id,
                      branch: document.branch
                    }),
                    stacked: false
                  }
                ]
              : []),
            ...(document.stack ?? [])
              .filter(
                (layer) =>
                  layer.base === base &&
                  layer.prState === "merged" &&
                  layer.landed !== true
              )
              .map((layer) => ({
                ...baseMatch({ ticketId: document.id, branch: layer.branch }),
                stacked: true
              }))
          ])
        const index = makeFakeIndex({
          findMergesAwaiting: (_projectId, base) =>
            Effect.sync(() => awaiting(base))
        })

        yield* landMergesInto(
          {
            ticketDocs: docs.shape,
            ticketIndex: index.shape,
            ticketDocumentLock: yield* TicketDocumentLock.TicketDocumentLock,
            gitAutomation: gitAutomationTestService()
          },
          "project-1",
          "feat/base",
          "delivery-1",
          DateTime.toDate(DateTime.makeUnsafe("2026-05-01T12:00:00Z")),
          new Map(
            [
              [20, "11"],
              [21, "10"],
              [30, "09"],
              [50, "12"],
              [60, "13"]
            ].map(([pr, hour]) => [
              Number(pr),
              DateTime.toDate(DateTime.makeUnsafe(`2026-05-01T${hour}:00:00Z`))
            ])
          )
        )

        expect(docs.documents.get("T-2")).toMatchObject({
          lastTransitionedPr: 20,
          stack: [
            { branch: "ui", prState: "merged", landed: true },
            { branch: "docs", prState: "open" }
          ],
          status: "in_progress"
        })
        expect(docs.documents.get("T-3")).toMatchObject({
          lastTransitionedPr: 30,
          status: "done"
        })
        for (const pr of [50, 60, 70])
          expect(docs.documents.get(`T-${pr}`)?.lastTransitionedPr).toBeNull()
        expect(docs.documents.get("T-4")).toMatchObject({
          lastTransitionedPr: null,
          status: "in_progress"
        })
      })
  )
})
