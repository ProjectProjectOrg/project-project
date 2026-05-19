import { it } from "@effect/vitest"
import * as Effect from "effect/Effect"
import * as Schema from "effect/Schema"
import { expect } from "vitest"
import { makeGitHubWebhooks } from "./GitHubWebhooks"
import type {
  GitHubPullRequestWebhookChange,
  GitHubWebhookMutationSink
} from "../Services/GitHubWebhooks"

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
    })
})

const delivery = (event: string, body: unknown) => ({
  event,
  deliveryId: "delivery-1",
  body: Schema.encodeSync(Schema.parseJson())(body)
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
      { action: "opened", merged: false, expectedState: "open" },
      { action: "reopened", merged: false, expectedState: "open" },
      { action: "synchronize", merged: false, expectedState: "open" },
      { action: "closed", merged: false, expectedState: "closed" },
      { action: "closed", merged: true, expectedState: "merged" }
    ]
    for (const input of cases) {
      yield* webhooks.handle(
        delivery("pull_request", {
          action: input.action,
          installation: { id: "123" },
          repository: { id: "456" },
          number: 80,
          pull_request: {
            merged: input.merged,
            head: { ref: "feat/T-84-pr-webhook-lifecycle", repo: { id: 456 } }
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
          state: input.expectedState
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
        action: "edited",
        installation: { id: "123" },
        repository: { id: "456" },
        number: 80,
        pull_request: {
          merged: false,
          head: { ref: "feat/T-84-pr-webhook-lifecycle", repo: { id: 456 } }
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
          head: { ref: "feat/T-84-pr-webhook-lifecycle", repo: { id: 999 } }
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
