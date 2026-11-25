import type { GitState, StackLayerState } from "@pp/shared"
import { HoverCardFooter, HoverCardTitle } from "@pp/ui/hover-card"
import { ArrowRight, Layers, LoaderCircle, type IconType } from "@pp/ui/icons"
import { cn } from "@pp/ui/lib/utils"
import { MiddleTruncate } from "@pp/ui/middle-truncate"

import { withoutTicketId } from "@/features/github/lib/branchPicker"
import {
  layerTone,
  stackSummary,
  TONES
} from "@/features/github/lib/stackPresentation"
import { TimelineTime } from "@/features/tickets/components/TimelineTime"
import { m } from "@/paraglide/messages"

import {
  CHECKS,
  needsAttention,
  PULL_REQUEST_LOOKS,
  pullRequestKind,
  reportedChecks,
  type Checks,
  type PullRequest
} from "./gitLooks"

export function PullRequestPreview({
  pr,
  ticketId,
  repo
}: Readonly<{ pr: PullRequest; ticketId: string; repo: string | null }>) {
  const look = PULL_REQUEST_LOOKS[pullRequestKind(pr)]
  const title = pr.tag === "pr_pending" ? "" : pr.title
  return (
    <>
      <PreviewHeader
        icon={look.icon}
        tone={look.tone}
        label={look.label()}
        detail={`#${pr.number}`}
        repo={repo}
      />
      {title !== "" && <HoverCardTitle>{title}</HoverCardTitle>}
      <PreviewBranch
        name={withoutTicketId(pr.branch, ticketId)}
        base={pr.baseBranch}
      />
      <PullRequestOutcome pr={pr} />
    </>
  )
}

export function StackPreview({
  own,
  stack,
  layers,
  repo
}: Readonly<{
  own: GitState
  stack: ReadonlyArray<StackLayerState>
  layers: ReadonlyArray<StackLayerState>
  repo: string | null
}>) {
  const { count, anyOpen } = stackSummary(own, stack)
  const ownName = ownBranch(own)
  return (
    <>
      <PreviewHeader
        icon={Layers}
        tone={
          anyOpen
            ? "text-state-success"
            : count.merged > 0
              ? "text-state-merged"
              : undefined
        }
        label={m.git_stack_heading()}
        detail={m.git_preview_stack_merged(count)}
        repo={repo}
      />
      <ul className="-mx-1 flex flex-col">
        {layers.map((layer) => (
          <StackLayerRow
            key={layer.branch}
            layer={layer}
            own={layer.branch === ownName}
          />
        ))}
      </ul>
    </>
  )
}

function PreviewHeader({
  icon: Icon,
  tone,
  label,
  detail,
  repo
}: Readonly<{
  icon: IconType
  tone?: string
  label: string
  detail: string
  repo: string | null
}>) {
  return (
    <div className="flex min-w-0 items-center gap-1.5 text-caption text-muted-foreground tabular-nums">
      <Icon className={cn("size-3.5 shrink-0", tone)} strokeWidth={1.75} />
      <span>{label}</span>
      <span>{detail}</span>
      {repo !== null && <span className="ml-auto truncate pl-2">{repo}</span>}
    </div>
  )
}

function PreviewBranch({
  name,
  base
}: Readonly<{ name: string; base: string }>) {
  return (
    <div className="flex min-w-0 items-center gap-1 text-caption text-muted-foreground tabular-nums">
      <MiddleTruncate value={name} className="text-foreground" />
      <ArrowRight className="size-3 shrink-0" strokeWidth={1.75} />
      <span className="shrink-0">{base}</span>
    </div>
  )
}

function PullRequestOutcome({ pr }: Readonly<{ pr: PullRequest }>) {
  if (pr.tag === "pr_pending") {
    return (
      <HoverCardFooter>
        <LoaderCircle
          className="size-3.5 shrink-0 text-state-warning motion-safe:animate-spin"
          strokeWidth={1.75}
        />
        {m.git_pr_opening()}
      </HoverCardFooter>
    )
  }
  if (pr.tag === "pr_merged") {
    return (
      <HoverCardFooter>
        <span className="min-w-0 truncate">
          {m.git_preview_merged_into({ base: pr.baseBranch })}
        </span>
        {pr.mergedAt !== null && (
          <TimelineTime at={pr.mergedAt} className="shrink-0" />
        )}
      </HoverCardFooter>
    )
  }
  if (pr.tag === "pr_closed") {
    return <HoverCardFooter>{m.git_preview_closed()}</HoverCardFooter>
  }
  const checks = reportedChecks(pr.checks)
  if (checks === null) return null
  const { icon: Icon, tone, motion, label } = CHECKS[checks]
  return (
    <HoverCardFooter>
      <Icon
        className={cn("size-3.5 shrink-0", tone, motion)}
        strokeWidth={1.75}
      />
      <span className="text-foreground">{capitalize(label())}</span>
    </HoverCardFooter>
  )
}

const capitalize = (text: string) =>
  text.charAt(0).toUpperCase() + text.slice(1)

const ownBranch = (own: GitState) =>
  "branch" in own ? own.branch : "name" in own ? own.name : null

function StackLayerRow({
  layer,
  own
}: Readonly<{ layer: StackLayerState; own: boolean }>) {
  const tone = layerTone(layer)
  const { icon: Icon, className, label } = TONES[tone]
  const checks = reportedChecks(layer.pr?.checks ?? undefined)
  return (
    <li
      className={cn(
        "flex min-w-0 items-center gap-2 px-1 py-1 text-body text-muted-foreground",
        own && "[&_[data-layer-title]]:font-semibold"
      )}
    >
      <Icon
        aria-hidden
        className={cn("size-3.5 shrink-0", className)}
        strokeWidth={1.75}
      />
      <span className="sr-only">{label()}</span>
      {layer.pr === null ? (
        <span className="min-w-0 truncate text-caption tabular-nums">
          {layer.branch}
        </span>
      ) : (
        <>
          <span className="shrink-0 text-caption tabular-nums">
            #{layer.pr.number}
          </span>
          <span
            data-layer-title=""
            className="min-w-0 flex-1 truncate text-foreground"
          >
            {layer.pr.title === "" ? layer.branch : layer.pr.title}
          </span>
        </>
      )}
      {tone !== "merged" && needsAttention(checks) && (
        <ChecksIcon checks={checks} />
      )}
    </li>
  )
}

function ChecksIcon({ checks }: Readonly<{ checks: Checks }>) {
  const { icon: Icon, tone, motion, label } = CHECKS[checks]
  return (
    <>
      <Icon
        aria-hidden
        className={cn("size-3 shrink-0", tone, motion)}
        strokeWidth={1.75}
      />
      <span className="sr-only">{label()}</span>
    </>
  )
}
