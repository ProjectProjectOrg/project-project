// Reviews service - ticket-linked PR diff/review read model.
//
// GitHub owns PR review state. ProjectProject resolves "which PR?" through
// project markdown (`github`) and ticket frontmatter (`pr`), then normalizes
// GitHub data into the shared review bundle for the frontend.

import { Effect } from "effect"
import {
  Conflict,
  GitHubError,
  GitHubScopeInsufficient,
  GitHubTokenExpired,
  NotFound,
  PullRequestReviewBundle,
  RateLimited,
  RepoGone,
  Slug,
  TicketId
} from "@projectproject/shared"
import { GitHub, type RawPullReviewBundle } from "./GitHub"
import { type MarkdownError } from "./Markdown"
import { Projects } from "./Projects"
import { Tickets } from "./Tickets"

function toWireBundle(args: {
  slug: Slug
  ticketId: TicketId
  repoOwner: string
  repoName: string
  raw: RawPullReviewBundle
}): PullRequestReviewBundle {
  const pr = args.raw.pr
  return PullRequestReviewBundle.make({
    projectSlug: args.slug,
    ticketId: args.ticketId,
    repoOwner: args.repoOwner,
    repoName: args.repoName,
    number: pr.number,
    nodeId: pr.nodeId,
    url: pr.url,
    title: pr.title,
    body: pr.body,
    state: pr.merged ? "merged" : pr.state,
    draft: pr.draft,
    author: pr.author,
    baseBranch: pr.baseBranch,
    headBranch: pr.headBranch,
    baseSha: pr.baseSha,
    headSha: pr.headSha,
    mergeable: pr.mergeable === true
      ? "mergeable"
      : pr.mergeable === false
      ? "conflicting"
      : "unknown",
    additions: pr.additions,
    deletions: pr.deletions,
    changedFiles: pr.changedFiles,
    patch: args.raw.patch,
    files: [...args.raw.files],
    threads: [...args.raw.threads].map((thread) => ({
      ...thread,
      comments: [...thread.comments]
    })),
    fetchedAt: new Date()
  })
}

export class Reviews extends Effect.Service<Reviews>()(
  "Reviews",
  {
    effect: Effect.gen(function*() {
      const projects = yield* Projects
      const tickets = yield* Tickets
      const github = yield* GitHub

      const getForTicket = (
        userId: string,
        slug: string,
        ticketId: string
      ): Effect.Effect<
        PullRequestReviewBundle,
        | NotFound
        | Conflict
        | GitHubTokenExpired
        | GitHubScopeInsufficient
        | RepoGone
        | RateLimited
        | GitHubError
        | MarkdownError
      > =>
        Effect.gen(function*() {
          yield* projects.requireMember(userId, slug)
          const project = yield* projects.get(userId, slug)
          if (!project.github) {
            return yield* Effect.fail(
              new Conflict({ reason: "no_github_connection" })
            )
          }

          const ticket = yield* tickets.get(userId, slug, ticketId)
          if (ticket.pr === null) {
            return yield* Effect.fail(
              new Conflict({ reason: "no_pr_on_ticket" })
            )
          }

          const raw = yield* github.fetchPullReviewBundle(
            project.github.repoOwner,
            project.github.repoName,
            ticket.pr,
            userId
          )

          return toWireBundle({
            slug: project.slug,
            ticketId: ticket.id,
            repoOwner: project.github.repoOwner,
            repoName: project.github.repoName,
            raw
          })
        })

      return { getForTicket } as const
    }),
    dependencies: []
  }
) {}
