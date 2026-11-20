import { useAtomValue } from "@effect/atom-react"
import type {
  GithubConnection,
  GitState,
  StackLayerState,
  Ticket
} from "@pp/shared"
import { Badge } from "@pp/ui/badge"
import { Chip } from "@pp/ui/chip"
import { AlertTriangle, GitBranch } from "@pp/ui/icons"
import { cn } from "@pp/ui/lib/utils"
import { MiddleTruncate } from "@pp/ui/middle-truncate"
import { Tooltip, TooltipContent, TooltipTrigger } from "@pp/ui/tooltip"
import * as Result from "effect/reactivity/AsyncResult"
import type { MouseEvent } from "react"

import { richChipColors } from "@/features/auth/atoms/auth"
import { usePreferredBranchLink } from "@/features/github/components/ticket-git/BranchChip"
import { ownLayer } from "@/features/github/components/ticket-git/TicketStack"
import { useTicketGit } from "@/features/github/hooks/useTicketGit"
import { withoutTicketId } from "@/features/github/lib/branchPicker"
import { connectedRepos, ticketRepo } from "@/features/github/lib/repos"
import { project, projectRequest } from "@/features/projects/atoms/projects"
import { useProjectRoute } from "@/features/projects/hooks/useProject"
import {
  TicketPreview,
  TicketPreviewTrigger
} from "@/features/tickets/components/ticket-preview/TicketPreview"
import { m } from "@/paraglide/messages"

import { GitChipMenu } from "./GitChipMenu"
import {
  needsAttention,
  PULL_REQUEST_BADGE_TONES,
  PULL_REQUEST_LOOKS,
  pullRequestKind,
  reportedChecks,
  type PullRequest
} from "./gitLooks"
import { ChecksDot, StackChip } from "./GitStackChip"

export function BoardCardGit({
  ticket
}: Readonly<{
  ticket: Pick<
    Ticket,
    | "id"
    | "gitState"
    | "type"
    | "title"
    | "status"
    | "lastTransitionedPr"
    | "repoId"
  >
}>) {
  const { orgSlug, slug } = useProjectRoute()
  const projectResult = useAtomValue(project(projectRequest(orgSlug, slug)))
  const github = Result.isSuccess(projectResult)
    ? ticketRepo(projectResult.value, ticket.repoId)
    : null
  if (!github || !Result.isSuccess(projectResult)) return null
  const repoLabel =
    connectedRepos(projectResult.value).length > 1 ? github.repoName : null
  return <ConnectedGit ticket={ticket} github={github} repoLabel={repoLabel} />
}

function ConnectedGit({
  ticket,
  github,
  repoLabel
}: Readonly<{
  ticket: Pick<
    Ticket,
    "id" | "gitState" | "type" | "title" | "status" | "lastTransitionedPr"
  >
  github: GithubConnection
  repoLabel: string | null
}>) {
  const { orgSlug, slug } = useProjectRoute()
  const { state, waiting, stack } = useTicketGit(orgSlug, slug, ticket)
  if (!state) return null
  return (
    <GitChip
      state={state}
      stack={stack}
      waiting={waiting}
      github={github}
      repoLabel={repoLabel}
      ticket={ticket}
    />
  )
}

function GitChip({
  state,
  stack,
  waiting,
  github,
  repoLabel,
  ticket
}: Readonly<{
  state: GitState
  stack: ReadonlyArray<StackLayerState>
  waiting: boolean
  github: GithubConnection
  repoLabel: string | null
  ticket: Pick<
    Ticket,
    "id" | "type" | "title" | "status" | "lastTransitionedPr"
  >
}>) {
  if (state.tag === "no_branch") return null
  const own = ownLayer(state, ticket, github.defaultBaseBranch ?? "main")
  const layers = own === null ? stack : [own, ...stack]
  return (
    <GitChipMenu
      state={state}
      stack={stack}
      layers={layers}
      github={github}
      ticket={ticket}
    >
      <GitChipFace
        state={state}
        stack={stack}
        layers={layers}
        waiting={waiting}
        repo={`${github.repoOwner}/${github.repoName}`}
        repoLabel={repoLabel}
        ticketId={ticket.id}
      />
    </GitChipMenu>
  )
}

function GitChipFace({
  state,
  stack,
  layers,
  waiting,
  repo,
  repoLabel,
  ticketId
}: Readonly<{
  state: Exclude<GitState, { tag: "no_branch" }>
  stack: ReadonlyArray<StackLayerState>
  layers: ReadonlyArray<StackLayerState>
  waiting: boolean
  repo: string
  repoLabel: string | null
  ticketId: Ticket["id"]
}>) {
  const pulse =
    waiting || state.tag === "branch_pending" || state.tag === "pr_pending"

  if (stack.length > 0) {
    return (
      <StackChip
        own={state}
        stack={stack}
        layers={layers}
        pulse={pulse}
        repoLabel={repoLabel}
      />
    )
  }
  if (state.tag === "stale_branch") {
    return (
      <Tooltip>
        <TooltipTrigger
          render={
            <Chip
              interaction="hover"
              render={<span />}
              data-pending={pulse || undefined}
              className="relative z-20"
            />
          }
        >
          <AlertTriangle
            className="size-3 shrink-0 text-state-warning"
            strokeWidth={1.75}
          />
          {m.git_stale_branch_pill()}
        </TooltipTrigger>
        <TooltipContent>
          {m.git_stale_branch_title({ name: state.name })}
        </TooltipContent>
      </Tooltip>
    )
  }
  if (state.tag === "branch_no_pr" || state.tag === "branch_pending") {
    return (
      <BranchChip
        repo={repo}
        name={state.name}
        label={withoutTicketId(state.name, ticketId)}
        pulse={pulse}
      />
    )
  }
  return (
    <PullRequestChip
      pr={state}
      pulse={pulse}
      repoLabel={repoLabel}
      ticketId={ticketId}
    />
  )
}

function BranchChip({
  repo,
  name,
  label,
  pulse
}: Readonly<{
  repo: string
  name: string
  label: string
  pulse: boolean
}>) {
  const link = usePreferredBranchLink(repo, name)
  return (
    <Chip
      interaction="press"
      render={
        <a
          href={link.href}
          target={link.target}
          rel={link.rel}
          aria-label={name}
        />
      }
      draggable={false}
      onClick={(event) => event.stopPropagation()}
      data-pending={pulse || undefined}
      className="max-w-36"
    >
      <GitBranch className="size-3 shrink-0" strokeWidth={1.75} />
      <MiddleTruncate value={label} className="tabular-nums" />
    </Chip>
  )
}

function PullRequestChip({
  pr,
  pulse,
  repoLabel,
  ticketId
}: Readonly<{
  pr: PullRequest
  pulse: boolean
  repoLabel: string | null
  ticketId: Ticket["id"]
}>) {
  const kind = pullRequestKind(pr)
  const Icon = PULL_REQUEST_LOOKS[kind].icon
  const checks = pr.tag === "pr_open" ? reportedChecks(pr.checks) : null
  const title = pr.tag === "pr_pending" ? null : pr.title
  const rich = useAtomValue(richChipColors)
  const link = (
    <a
      href={pr.url}
      target="_blank"
      rel="noreferrer"
      aria-label={title === null ? `#${pr.number}` : `#${pr.number} ${title}`}
    />
  )
  const face = {
    draggable: false,
    onClick: (event: MouseEvent) => event.stopPropagation(),
    "data-pending": pulse || undefined
  }
  return (
    <TicketPreviewTrigger
      preview={TicketPreview.pullRequest({ pr, ticketId, repo: repoLabel })}
      render={
        rich ? (
          <Badge
            tone={PULL_REQUEST_BADGE_TONES[kind]}
            render={link}
            {...face}
          />
        ) : (
          <Chip interaction="press" render={link} {...face} />
        )
      }
    >
      <Icon
        className={
          rich
            ? undefined
            : cn("size-3 shrink-0", PULL_REQUEST_LOOKS[kind].tone)
        }
        strokeWidth={1.75}
      />
      <span className="tabular-nums">#{pr.number}</span>
      {needsAttention(checks) && <ChecksDot checks={checks} />}
    </TicketPreviewTrigger>
  )
}
