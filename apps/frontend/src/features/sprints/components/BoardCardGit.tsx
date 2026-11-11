import { useAtomValue } from "@effect/atom-react"
import type {
  GithubConnection,
  GitState,
  StackLayerState,
  Ticket
} from "@pp/shared"
import * as Result from "effect/reactivity/AsyncResult"
import {
  AlertTriangle,
  ArrowRight,
  GitBranch,
  LoaderCircle
} from "lucide-react"

import { MiddleTruncate } from "@/components/ui/middle-truncate"
import { usePreferredBranchLink } from "@/features/github/components/ticket-git/BranchChip"
import { pendingLabel } from "@/features/github/components/ticket-git/GitField"
import { ownLayer } from "@/features/github/components/ticket-git/TicketStack"
import { useTicketGit } from "@/features/github/hooks/useTicketGit"
import { withoutTicketId } from "@/features/github/lib/branchPicker"
import { ticketRepo } from "@/features/github/lib/repos"
import { project, projectRequest } from "@/features/projects/atoms/projects"
import { useProjectRoute } from "@/features/projects/hooks/useProject"
import { formatRelative } from "@/lib/relativeTime"
import { cn } from "@/lib/utils"
import { m } from "@/paraglide/messages"

import { GitChipMenu } from "./GitChipMenu"
import {
  CHECKS,
  needsAttention,
  PULL_REQUEST_LOOKS,
  pullRequestKind,
  reportedChecks,
  type PullRequest
} from "./gitLooks"
import {
  GitPreview,
  PreviewCallout,
  PreviewItem,
  PreviewMeta,
  PreviewTitle
} from "./GitPreview"
import { ChecksDot, StackChip } from "./GitStackChip"

export function BoardCardGit({
  ticket,
  chipClassName
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
  chipClassName: string
}>) {
  const { orgSlug, slug } = useProjectRoute()
  const projectResult = useAtomValue(project(projectRequest(orgSlug, slug)))
  const github = Result.isSuccess(projectResult)
    ? ticketRepo(projectResult.value, ticket.repoId)
    : null
  if (!github) return null
  return (
    <ConnectedGit
      ticket={ticket}
      github={github}
      chipClassName={chipClassName}
    />
  )
}

function ConnectedGit({
  ticket,
  github,
  chipClassName
}: Readonly<{
  ticket: Pick<
    Ticket,
    "id" | "gitState" | "type" | "title" | "status" | "lastTransitionedPr"
  >
  github: GithubConnection
  chipClassName: string
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
      ticket={ticket}
      chipClassName={chipClassName}
    />
  )
}

export function GitChip({
  state,
  stack,
  waiting,
  github,
  ticket,
  chipClassName
}: Readonly<{
  state: GitState
  stack: ReadonlyArray<StackLayerState>
  waiting: boolean
  github: GithubConnection
  ticket: Pick<
    Ticket,
    "id" | "type" | "title" | "status" | "lastTransitionedPr"
  >
  chipClassName: string
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
        ticketId={ticket.id}
        chipClassName={chipClassName}
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
  ticketId,
  chipClassName
}: Readonly<{
  state: Exclude<GitState, { tag: "no_branch" }>
  stack: ReadonlyArray<StackLayerState>
  layers: ReadonlyArray<StackLayerState>
  waiting: boolean
  repo: string
  ticketId: Ticket["id"]
  chipClassName: string
}>) {
  const pulse =
    (waiting || state.tag === "branch_pending" || state.tag === "pr_pending") &&
    "animate-pulse"
  const className = cn(chipClassName, pulse)

  if (stack.length > 0) {
    return (
      <StackChip
        own={state}
        stack={stack}
        layers={layers}
        className={className}
      />
    )
  }
  if (state.tag === "stale_branch") {
    return (
      <GitPreview
        trigger={<span className={className} />}
        preview={
          <>
            <PreviewTitle mono>{state.name}</PreviewTitle>
            <PreviewCallout
              icon={AlertTriangle}
              tone="text-state-warning"
              label={m.git_stale_branch_status()}
            />
          </>
        }
      >
        <AlertTriangle
          className="size-3 shrink-0 text-state-warning"
          strokeWidth={1.75}
        />
        {m.git_stale_branch_pill()}
      </GitPreview>
    )
  }
  if (state.tag === "branch_no_pr" || state.tag === "branch_pending") {
    return (
      <BranchChip
        repo={repo}
        name={state.name}
        label={withoutTicketId(state.name, ticketId)}
        base={state.baseBranch}
        pending={state.tag === "branch_pending" ? pendingLabel(state) : null}
        className={className}
      />
    )
  }
  return <PullRequestChip pr={state} className={className} />
}

function BranchChip({
  repo,
  name,
  label,
  base,
  pending,
  className
}: Readonly<{
  repo: string
  name: string
  label: string
  base: string
  pending: string | null
  className: string
}>) {
  const link = usePreferredBranchLink(repo, name)
  return (
    <GitPreview
      trigger={
        <a
          href={link.href}
          target={link.target}
          rel={link.rel}
          aria-label={name}
          draggable={false}
          onClick={(event) => event.stopPropagation()}
          className={cn(className, "max-w-36")}
        />
      }
      preview={
        <>
          <PreviewTitle mono>{name}</PreviewTitle>
          <PreviewMeta>
            {pending === null ? (
              <PreviewItem icon={GitBranch}>
                {m.git_stack_state_no_pr()}
              </PreviewItem>
            ) : (
              <PreviewItem icon={LoaderCircle} tone="text-state-warning">
                {pending}
              </PreviewItem>
            )}
            <PreviewItem icon={ArrowRight}>
              <span className="font-mono">{base}</span>
            </PreviewItem>
          </PreviewMeta>
        </>
      }
    >
      <GitBranch className="size-3 shrink-0" strokeWidth={1.75} />
      <MiddleTruncate value={label} title={undefined} className="font-mono" />
    </GitPreview>
  )
}

function PullRequestChip({
  pr,
  className
}: Readonly<{ pr: PullRequest; className: string }>) {
  const look = PULL_REQUEST_LOOKS[pullRequestKind(pr)]
  const Icon = look.icon
  const checks = pr.tag === "pr_open" ? reportedChecks(pr.checks) : null
  const title = pr.tag === "pr_pending" ? null : pr.title
  return (
    <GitPreview
      trigger={
        <a
          href={pr.url}
          target="_blank"
          rel="noreferrer"
          aria-label={
            title === null ? `#${pr.number}` : `#${pr.number} ${title}`
          }
          draggable={false}
          onClick={(event) => event.stopPropagation()}
          className={className}
        />
      }
      preview={
        <>
          {title === null ? (
            <PreviewTitle mono>{pr.branch}</PreviewTitle>
          ) : (
            <PreviewTitle>{title}</PreviewTitle>
          )}
          <PreviewMeta>
            {pr.tag === "pr_pending" ? (
              <PreviewItem icon={LoaderCircle} tone="text-state-warning">
                {m.git_pr_opening()}
              </PreviewItem>
            ) : (
              <PreviewItem icon={Icon} tone={look.tone}>
                {look.label()}
              </PreviewItem>
            )}
            <span className="tabular-nums">#{pr.number}</span>
            {pr.tag === "pr_merged" ? (
              pr.mergedAt !== null && <span>{formatRelative(pr.mergedAt)}</span>
            ) : (
              <PreviewItem icon={GitBranch}>
                <MiddleTruncate
                  value={pr.branch}
                  title={undefined}
                  className="max-w-28 font-mono"
                />
                <ArrowRight className="size-3 shrink-0" strokeWidth={1.75} />
                <span className="font-mono">{pr.baseBranch}</span>
              </PreviewItem>
            )}
          </PreviewMeta>
          {needsAttention(checks) && (
            <PreviewCallout
              icon={CHECKS[checks].icon}
              tone={CHECKS[checks].tone}
              label={capitalize(CHECKS[checks].label())}
            />
          )}
        </>
      }
    >
      <Icon className={cn("size-3 shrink-0", look.tone)} strokeWidth={1.75} />
      <span className="tabular-nums">#{pr.number}</span>
      {needsAttention(checks) && <ChecksDot checks={checks} />}
    </GitPreview>
  )
}

const capitalize = (text: string) =>
  text.charAt(0).toUpperCase() + text.slice(1)
