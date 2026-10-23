import { it } from "@effect/vitest"
import type {
  GitHubBranchDeletionChange,
  GitHubCheckWebhookChange,
  GitHubPullRequestWebhookChange,
  GitHubRepositoryMetadataChange
} from "@pp/shared"
import * as DateTime from "effect/DateTime"
import * as Effect from "effect/Effect"
import * as Schema from "effect/Schema"
import { expect } from "vitest"

import type { GitHubWebhookMutationSink } from "./GitHubWebhooks"
import { makeGitHubWebhooks } from "./GitHubWebhooksLive"
type Call =
  | Readonly<{ type: "deleted"; installationId: string }>
  | Readonly<{ type: "suspended"; installationId: string }>
  | Readonly<{ type: "unsuspended"; installationId: string }>
  | Readonly<{
      type: "reposRemoved"
      installationId: string
      repoIds: ReadonlyArray<string>
    }>
  | Readonly<{
      type: "pullRequestChanged"
      change: GitHubPullRequestWebhookChange
    }>
  | Readonly<{
      type: "repositoryRenamed"
      change: GitHubRepositoryMetadataChange
    }>
  | Readonly<{
      type: "repositoryTransferred"
      change: GitHubRepositoryMetadataChange
    }>
  | Readonly<{
      type: "repositoryArchived"
      installationId: string
      repoId: string
    }>
  | Readonly<{
      type: "repositoryUnarchived"
      installationId: string
      repoId: string
    }>
  | Readonly<{
      type: "repositoryDeleted"
      installationId: string
      repoId: string
    }>
  | Readonly<{
      type: "branchDeleted"
      change: GitHubBranchDeletionChange
    }>
  | Readonly<{
      type: "checkStateChanged"
      change: GitHubCheckWebhookChange
    }>

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
