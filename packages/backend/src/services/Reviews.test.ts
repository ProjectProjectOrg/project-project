import { it } from "@effect/vitest"
import {
  Conflict,
  type PullRequestReviewBundle,
  type Slug,
  type TicketId
} from "@projectproject/shared"
import { Effect, Layer } from "effect"
import { expect } from "vitest"
import { GitHub, type RawPullReviewBundle } from "./GitHub"
import { Projects } from "./Projects"
import { Reviews } from "./Reviews"
import { Tickets } from "./Tickets"

const slug = "demo" as Slug
const ticketId = "T-1" as TicketId

const rawBundle: RawPullReviewBundle = {
  pr: {
    number: 42,
    nodeId: "PR_node",
    url: "https://github.com/acme/demo/pull/42",
    title: "Ship review UI",
    body: null,
    state: "open",
    merged: false,
    draft: false,
    author: {
      login: "wouter",
      name: "Wouter",
      avatarUrl: "https://avatars.githubusercontent.com/u/1",
      url: "https://github.com/wouter"
    },
    baseBranch: "main",
    headBranch: "feat/review-ui",
    baseSha: "base",
    headSha: "head",
    mergeable: null,
    additions: 10,
    deletions: 2,
    changedFiles: 1
  },
  patch: "diff --git a/a.ts b/a.ts\n",
  files: [
    {
      path: "a.ts",
      previousPath: null,
      status: "modified",
      additions: 10,
      deletions: 2,
      changes: 12,
      patchAvailable: true,
      blobUrl: "https://github.com/acme/demo/blob/head/a.ts",
      rawUrl: "https://raw.githubusercontent.com/acme/demo/head/a.ts"
    }
  ],
  threads: []
}

function project(
  github: PullRequestReviewBundle["repoOwner"] extends string ? {
      repoOwner: string
      repoName: string
      defaultBaseBranch: string | null
    } | null
    : never
) {
  return {
    slug,
    name: "Demo",
    ownerId: "user-1",
    createdAt: new Date("2026-01-01T00:00:00Z"),
    github,
    body: "# Demo\n",
    members: []
  }
}

function runWith(args: {
  githubConnection: ReturnType<typeof project>["github"]
  ticketPr: number | null
}) {
  const calls: Array<{ owner: string; name: string; prNumber: number }> = []
  const ProjectsLive = Layer.succeed(Projects, {
    requireMember: () => Effect.void,
    get: () => Effect.succeed(project(args.githubConnection))
  } as never)
  const TicketsLive = Layer.succeed(Tickets, {
    get: () =>
      Effect.succeed({
        id: ticketId,
        title: "Review UI",
        status: "in_progress" as const,
        type: "feat" as const,
        branch: "feat/review-ui",
        pr: args.ticketPr,
        lastTransitionedPr: null,
        assignee: null,
        createdBy: "user-1",
        createdAt: new Date("2026-01-01T00:00:00Z"),
        updatedAt: new Date("2026-01-01T00:00:00Z"),
        body: "# Review UI\n"
      })
  } as never)
  const GitHubLive = Layer.succeed(GitHub, {
    fetchPullReviewBundle: (owner: string, name: string, prNumber: number) => {
      calls.push({ owner, name, prNumber })
      return Effect.succeed(rawBundle)
    }
  } as never)

  const layer = Reviews.Default.pipe(
    Layer.provide(ProjectsLive),
    Layer.provide(TicketsLive),
    Layer.provide(GitHubLive)
  )

  return {
    calls,
    run: <A, E>(effect: Effect.Effect<A, E, Reviews>) =>
      effect.pipe(Effect.provide(layer))
  }
}

it.effect("fails when the project has no GitHub connection", () =>
  Effect.gen(function*() {
    const { run } = runWith({ githubConnection: null, ticketPr: 42 })
    const result = yield* run(
      Effect.gen(function*() {
        const reviews = yield* Reviews
        return yield* reviews.getForTicket("user-1", slug, ticketId)
      })
    )
      .pipe(Effect.flip)

    expect(result).toBeInstanceOf(Conflict)
    if (result._tag !== "Conflict") throw new Error("expected Conflict")
    expect(result.reason).toBe("no_github_connection")
  }))

it.effect("fails when the ticket has no stored PR", () =>
  Effect.gen(function*() {
    const { run } = runWith({
      githubConnection: {
        repoOwner: "acme",
        repoName: "demo",
        defaultBaseBranch: null
      },
      ticketPr: null
    })
    const result = yield* run(
      Effect.gen(function*() {
        const reviews = yield* Reviews
        return yield* reviews.getForTicket("user-1", slug, ticketId)
      })
    )
      .pipe(Effect.flip)

    expect(result).toBeInstanceOf(Conflict)
    if (result._tag !== "Conflict") throw new Error("expected Conflict")
    expect(result.reason).toBe("no_pr_on_ticket")
  }))

it.effect("returns a ticket-linked review bundle", () =>
  Effect.gen(function*() {
    const { calls, run } = runWith({
      githubConnection: {
        repoOwner: "acme",
        repoName: "demo",
        defaultBaseBranch: null
      },
      ticketPr: 42
    })
    const result = yield* run(
      Effect.gen(function*() {
        const reviews = yield* Reviews
        return yield* reviews.getForTicket("user-1", slug, ticketId)
      })
    )

    expect(calls).toEqual([{ owner: "acme", name: "demo", prNumber: 42 }])
    expect(result.patch).toBe(rawBundle.patch)
    expect(result.mergeable).toBe("unknown")
    expect(result.files).toHaveLength(1)
  }))
