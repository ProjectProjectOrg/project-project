import {
  EMPTY_TICKET_RELATIONS,
  type TicketRelations,
  Forbidden,
  type NotFound,
  ProjectScope,
  type Ticket,
  type TicketParent,
  type TicketParentState,
  type TicketDetail,
  type User
} from "@pp/shared"
import * as Effect from "effect/Effect"

import { stackLayerStates } from "../git/stackLayerStates"
import * as ProjectGithub from "../github/ProjectGithub"
import type * as Markdown from "../markdown/Markdown"
import type * as TicketDocs from "./TicketDocs"
import type * as TicketIndex from "./TicketIndex"

export type TicketReadError =
  | NotFound
  | Markdown.MarkdownError
  | TicketDocs.MalformedTicketDocument

export type GitView = Readonly<{
  integrations: ReadonlyArray<ProjectGithub.ProjectGithubIntegration>
  visible: boolean
}>

export const repositoryOf = (
  view: GitView,
  repoId: string | null | undefined
) => ProjectGithub.integrationForRepo(view.integrations, repoId)

const withoutGit = <T extends Ticket>(ticket: T) => ({
  ...ticket,
  repoId: null,
  branch: null,
  pr: null,
  prState: null,
  lastTransitionedPr: null,
  gitState: { tag: "no_branch" } satisfies Ticket["gitState"]
})

export const presentTicket = <T extends Ticket>(view: GitView, ticket: T) =>
  view.visible ? ticket : withoutGit(ticket)

type GitState = Ticket["gitState"]

export function pendingGitState(
  document: Pick<TicketDocs.TicketDocument, "branch" | "pr" | "prState"> &
    Readonly<{ prBase?: string | null | undefined }>,
  github: ProjectGithub.ProjectGithubIntegration | null,
  branchDeletedAt: Date | null = null
) {
  const defaultBase = github?.defaultBaseBranch ?? "main"
  if (!document.branch)
    return {
      tag: "no_branch",
      baseBranch: defaultBase
    } satisfies GitState
  if (document.pr !== null) {
    const baseBranch = document.prBase ?? defaultBase
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
      } satisfies GitState
    }
    if (document.prState === "closed") {
      return {
        tag: "pr_closed",
        branch: document.branch,
        baseBranch,
        number: document.pr,
        url,
        title: ""
      } satisfies GitState
    }
    return {
      tag: "pr_pending",
      branch: document.branch,
      baseBranch,
      number: document.pr,
      url
    } satisfies GitState
  }
  if (branchDeletedAt !== null) {
    return {
      tag: "stale_branch",
      name: document.branch
    } satisfies GitState
  }
  return {
    tag: "branch_pending",
    name: document.branch,
    baseBranch: defaultBase
  } satisfies GitState
}

function documentToTicket(
  document: TicketDocs.TicketDocument,
  view: GitView,
  parent: TicketParent | null,
  branchDeletedAt: Date | null
) {
  const {
    body: _body,
    commentsRegion: _commentsRegion,
    repo,
    ...ticket
  } = document
  return presentTicket(view, {
    ...ticket,
    repoId: document.branch === null ? null : (repo ?? null),
    estimate: document.estimate ?? null,
    flag: document.flag ?? null,
    parent,
    gitState: pendingGitState(
      document,
      repositoryOf(view, repo),
      branchDeletedAt
    )
  } satisfies Ticket)
}

export function indexEntryToTicket(
  entry: TicketIndex.TicketIndexEntry,
  view: GitView
) {
  const { branchDeletedAt: _branchDeletedAt, ...ticket } = entry
  return presentTicket(view, {
    ...ticket,
    gitState: pendingGitState(
      entry,
      repositoryOf(view, entry.repoId),
      entry.branchDeletedAt
    )
  } satisfies Ticket)
}

type Hierarchy = Readonly<{
  parent: TicketParent | null
  parentState: TicketParentState | null
}>

export function parentOfEntry(entry: TicketIndex.TicketIndexEntry | undefined) {
  if (entry === undefined)
    return { parent: null, parentState: null } satisfies Hierarchy
  return {
    parent: { id: entry.id, title: entry.title, type: entry.type },
    parentState: {
      status: entry.status,
      subTicketCount: entry.subTicketCount,
      subTicketDoneCount: entry.subTicketDoneCount
    }
  } satisfies Hierarchy
}

export function documentToDetail(
  document: TicketDocs.TicketDocument,
  view: GitView,
  creator: User | null,
  updater: User | null,
  hierarchy: ReturnType<typeof parentOfEntry>,
  branchDeletedAt: Date | null = null,
  relations: TicketRelations = EMPTY_TICKET_RELATIONS
) {
  return {
    ...documentToTicket(document, view, hierarchy.parent, branchDeletedAt),
    parentState: hierarchy.parentState,
    stack: view.visible
      ? stackLayerStates(
          document.branch,
          document.stack,
          repositoryOf(view, document.repo)
        )
      : [],
    splitFrom: document.splitFrom ?? null,
    relations,
    creator,
    updater,
    body: document.body
  } satisfies TicketDetail
}

export const requirePolicy = (
  allowed: (scope: ProjectScope["Service"]) => boolean
) =>
  Effect.flatMap(ProjectScope, (scope) =>
    allowed(scope) ? Effect.void : Effect.fail(new Forbidden())
  )
