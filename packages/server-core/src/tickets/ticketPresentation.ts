import {
  Forbidden,
  type NotFound,
  type ProjectScopeShape,
  ProjectScope,
  type Ticket,
  type TicketDetail,
  type User
} from "@pp/shared"
import * as Effect from "effect/Effect"

import type { MarkdownError } from "../markdown/Markdown"
import type { ProjectGithubIntegration } from "../projects/Projects"
import { stackLayerStates } from "./stackLayerStates"
import type { MalformedTicketDocument, TicketDocument } from "./TicketDocs"
import type { TicketIndexEntry } from "./TicketIndex"
import type { TicketProject } from "./ticketProject"

export type TicketReadError = NotFound | MarkdownError | MalformedTicketDocument

export type GitView = Readonly<{
  integration: ProjectGithubIntegration | null
  visible: boolean
}>

const withoutGit = <T extends Ticket>(ticket: T): T => ({
  ...ticket,
  branch: null,
  pr: null,
  prState: null,
  lastTransitionedPr: null,
  gitState: { tag: "no_branch" }
})

export const presentTicket = <T extends Ticket>(view: GitView, ticket: T): T =>
  view.visible ? ticket : withoutGit(ticket)

export function pendingGitState(
  document: Pick<TicketDocument, "branch" | "pr" | "prState">,
  github: ProjectGithubIntegration | null,
  branchDeletedAt: Date | null = null
): Ticket["gitState"] {
  const baseBranch = github?.defaultBaseBranch ?? "main"
  if (!document.branch) return { tag: "no_branch", baseBranch }
  if (document.pr !== null) {
    const url = github
      ? `https://github.com/${github.repoOwner}/${github.repoName}/pull/${document.pr}`
      : ""
    if (document.prState === "merged") {
      return {
        tag: "pr_merged",
        branch: document.branch,
        baseBranch,
        number: document.pr,
        url,
        title: "",
        mergedAt: null
      }
    }
    if (document.prState === "closed") {
      return {
        tag: "pr_closed",
        branch: document.branch,
        baseBranch,
        number: document.pr,
        url,
        title: ""
      }
    }
    return {
      tag: "pr_pending",
      branch: document.branch,
      baseBranch,
      number: document.pr,
      url
    }
  }
  if (branchDeletedAt !== null) {
    return { tag: "stale_branch", name: document.branch }
  }
  return { tag: "branch_pending", name: document.branch, baseBranch }
}

export function documentToTicket(
  document: TicketDocument,
  view: GitView,
  branchDeletedAt: Date | null = null
): Ticket {
  const { body: _body, commentsRegion: _commentsRegion, ...ticket } = document
  return presentTicket(view, {
    ...ticket,
    estimate: document.estimate ?? null,
    parent: document.parent ?? null,
    gitState: pendingGitState(document, view.integration, branchDeletedAt)
  })
}

export function indexEntryToTicket(
  entry: TicketIndexEntry,
  view: GitView
): Ticket {
  const { branchDeletedAt: _branchDeletedAt, ...ticket } = entry
  return presentTicket(view, {
    ...ticket,
    gitState: pendingGitState(entry, view.integration, entry.branchDeletedAt)
  })
}

export function documentToDetail(
  document: TicketDocument,
  view: GitView,
  creator: User | null,
  updater: User | null,
  branchDeletedAt: Date | null = null
): TicketDetail {
  return {
    ...documentToTicket(document, view, branchDeletedAt),
    stack: view.visible
      ? stackLayerStates(document.branch, document.stack, view.integration)
      : [],
    splitFrom: document.splitFrom ?? null,
    creator,
    updater,
    body: document.body
  }
}

export const indexProjectOf = (scope: ProjectScopeShape): TicketProject => ({
  orgSlug: scope.orgSlug,
  organizationId: scope.organizationId,
  projectId: scope.projectId,
  slug: scope.slug
})

export const requirePolicy = (
  allowed: (scope: ProjectScopeShape) => boolean
): Effect.Effect<void, Forbidden, ProjectScope> =>
  Effect.flatMap(ProjectScope, (scope) =>
    allowed(scope) ? Effect.void : Effect.fail(new Forbidden())
  )
