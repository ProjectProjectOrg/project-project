import { useAtomValue } from "@effect/atom-react"
import type {
  GitState,
  GithubConnection,
  StackLayerState,
  Ticket,
  TicketDetail
} from "@pp/shared"
import * as Match from "effect/Match"
import * as Result from "effect/reactivity/AsyncResult"
import { AlertTriangle, Circle, Layers } from "lucide-react"

import { Badge } from "@/components/ui/badge"
import {
  AddStackedBranch,
  layerTone,
  StackedBranches,
  stackPullRequestCount
} from "@/features/github/components/ticket-git/TicketStack"
import { useTicketGit } from "@/features/github/hooks/useTicketGit"
import { checksColor } from "@/features/github/lib/checksColor"
import { project, projectRequest } from "@/features/projects/atoms/projects"
import { useProjectRoute } from "@/features/projects/hooks/useProject"
import { useProjectActor } from "@/lib/access"
import { cn } from "@/lib/utils"
import { m } from "@/paraglide/messages"

import { BranchChip } from "./BranchChip"
import { BranchNoPrPanel } from "./BranchNoPrPanel"
import { BranchPendingPanel } from "./BranchPendingPanel"
import { PANEL_CHROME, type GitPanelFrame } from "./gitPanelFrame"
import { NoBranchPanel } from "./NoBranchPanel"
import { PrClosedPanel } from "./PrClosedPanel"
import { PrLink } from "./PrLink"
import { PrMergedPanel } from "./PrMergedPanel"
import { PrOpenPanel } from "./PrOpenPanel"
import { PrPendingPanel } from "./PrPendingPanel"
import { StaleBranchPanel } from "./StaleBranchPanel"

function truncate(name: string, max = 18) {
  return name.length > max ? `${name.slice(0, max - 1)}…` : name
}

export function TicketGitChip({
  orgSlug,
  slug,
  ticket
}: {
  orgSlug: string
  slug: string
  ticket: Pick<Ticket, "id" | "gitState">
}) {
  const projectResult = useAtomValue(project(projectRequest(orgSlug, slug)))
  const github = Result.isSuccess(projectResult)
    ? projectResult.value.github
    : null
  if (!github) return <span aria-hidden />
  return (
    <ConnectedGitChip
      orgSlug={orgSlug}
      slug={slug}
      ticket={ticket}
      github={github}
    />
  )
}

function ConnectedGitChip({
  orgSlug,
  slug,
  ticket,
  github
}: Readonly<{
  orgSlug: string
  slug: string
  ticket: Pick<Ticket, "id" | "gitState">
  github: GithubConnection
}>) {
  const { state, waiting, stack } = useTicketGit(orgSlug, slug, ticket)
  if (!state || state.tag === "no_branch") return <span aria-hidden />
  const pending = state.tag === "branch_pending" || state.tag === "pr_pending"
  const pulse = (waiting || pending) && "animate-pulse"
  const repoSlug = `${github.repoOwner}/${github.repoName}`

  if (stack.length > 0) {
    return (
      <span className={cn(pulse)}>
        <StackChip own={state} stack={stack} />
      </span>
    )
  }

  if (state.tag === "stale_branch") {
    return (
      <Badge
        tone="amber"
        size="xs"
        className={cn(pulse)}
        title={m.git_stale_branch_title({ name: state.name })}
      >
        <AlertTriangle strokeWidth={1.75} />
        {m.git_stale_branch_pill()}
      </Badge>
    )
  }

  if (state.tag === "branch_no_pr" || state.tag === "branch_pending") {
    return (
      <span
        className={cn("inline-flex max-w-full min-w-0 items-center", pulse)}
      >
        <BranchChip
          slug={repoSlug}
          name={state.name}
          displayName={truncate(state.name)}
          variant="ghost"
        />
      </span>
    )
  }

  if (state.tag === "pr_open") {
    return (
      <span className={cn(pulse)}>
        <PrLink
          number={state.number}
          url={state.url}
          tone={state.draft ? "draft" : "open"}
          checks={state.checks}
        />
      </span>
    )
  }

  if (state.tag === "pr_pending") {
    return (
      <span className={cn(pulse)}>
        <PrLink number={state.number} url={state.url} tone="open" />
      </span>
    )
  }

  if (state.tag === "pr_merged") {
    return (
      <span className={cn(pulse)}>
        <PrLink number={state.number} url={state.url} tone="merged" />
      </span>
    )
  }

  if (state.tag === "pr_closed") {
    return (
      <span className={cn(pulse)}>
        <PrLink number={state.number} url={state.url} tone="closed" />
      </span>
    )
  }

  return null
}

export function TicketGitPanel({
  ticket,
  github,
  branchTemplate,
  variant = "bordered"
}: {
  ticket: TicketDetail
  github: GithubConnection | null
  branchTemplate: string | null
  variant?: "bordered" | "ghost"
}) {
  const { orgSlug, slug } = useProjectRoute()
  const { state, waiting, stack } = useTicketGit(orgSlug, slug, ticket)
  if (!github) return null
  if (state !== null && stack.length > 0) {
    return (
      <StackedBranches
        ticket={ticket}
        github={github}
        own={state}
        stack={stack}
        pulse={
          waiting ||
          state.tag === "branch_pending" ||
          state.tag === "pr_pending"
        }
        variant={variant}
      />
    )
  }
  if (state === null) {
    return (
      <div className={variant === "bordered" ? PANEL_CHROME : undefined}>
        <div className="skeleton h-7 w-44 rounded bg-muted/60" />
      </div>
    )
  }
  const stackable =
    state.tag === "branch_no_pr" ||
    state.tag === "pr_open" ||
    state.tag === "pr_pending" ||
    state.tag === "pr_merged" ||
    state.tag === "pr_closed"
  return (
    <div className="flex flex-col gap-3">
      <PanelForState
        ticket={ticket}
        state={state}
        waiting={waiting}
        github={github}
        branchTemplate={branchTemplate}
        variant={variant}
      />
      {stackable && <AddStackedBranch ticket={ticket} github={github} />}
    </div>
  )
}

function PanelForState({
  ticket,
  state,
  waiting,
  github,
  branchTemplate,
  variant
}: {
  ticket: TicketDetail
  state: GitState
  waiting: boolean
  github: GithubConnection
  branchTemplate: string | null
  variant: "bordered" | "ghost"
}) {
  const canWrite = useProjectActor().call("tickets", "createBranch")
  const pending = state.tag === "branch_pending" || state.tag === "pr_pending"
  const frame: GitPanelFrame = {
    ticket,
    github,
    branchTemplate,
    variant,
    canWrite,
    repoSlug: `${github.repoOwner}/${github.repoName}`,
    pulse: (waiting || pending) && "animate-pulse",
    panelChrome: variant === "bordered" ? PANEL_CHROME : undefined,
    buttonSize: variant === "bordered" ? "sm" : "xs"
  }

  return Match.value(state).pipe(
    Match.discriminatorsExhaustive("tag")({
      no_branch: () => <NoBranchPanel frame={frame} />,
      branch_pending: (s) => <BranchPendingPanel state={s} frame={frame} />,
      branch_no_pr: (s) => <BranchNoPrPanel state={s} frame={frame} />,
      pr_open: (s) => <PrOpenPanel state={s} frame={frame} />,
      pr_pending: (s) => <PrPendingPanel state={s} frame={frame} />,
      pr_merged: (s) => <PrMergedPanel state={s} frame={frame} />,
      pr_closed: (s) => <PrClosedPanel state={s} frame={frame} />,
      stale_branch: (s) => <StaleBranchPanel state={s} frame={frame} />
    })
  )
}

function StackChip({
  own,
  stack
}: Readonly<{ own: GitState; stack: ReadonlyArray<StackLayerState> }>) {
  const count = stackPullRequestCount(own, stack)
  const checks = [
    ...(own.tag === "pr_open" ? [own.checks] : []),
    ...stack.flatMap((layer) =>
      layer.pr?.checks && layerTone(layer) !== "merged" ? [layer.pr.checks] : []
    )
  ]
  const worst =
    checks.find((check) => check === "failing") ??
    checks.find((check) => check === "pending") ??
    checks.find((check) => check === "passing")
  const anyOpen =
    own.tag === "pr_open" ||
    stack.some((layer) => {
      const tone = layerTone(layer)
      return tone === "open" || tone === "draft"
    })
  return (
    <Badge
      tone={anyOpen ? "emerald" : count.merged > 0 ? "violet" : "muted"}
      size="xs"
      title={m.git_stack_count_title(count)}
    >
      <Layers strokeWidth={1.75} />
      {m.git_stack_count(count)}
      {worst && (
        <Circle
          className={cn("size-2 fill-current", checksColor(worst))}
          strokeWidth={0}
        />
      )}
    </Badge>
  )
}
