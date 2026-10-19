import { useAtomSet, useAtomValue } from "@effect/atom-react"
import type {
  ChecksStatus,
  GitState,
  GithubConnection,
  StackLayerState,
  Ticket,
  TicketDetail
} from "@pp/shared"
import * as Exit from "effect/Exit"
import * as Match from "effect/Match"
import * as Option from "effect/Option"
import * as Result from "effect/unstable/reactivity/AsyncResult"
import {
  AlertTriangle,
  GitBranch,
  GitMerge,
  GitPullRequest,
  GitPullRequestClosed,
  GitPullRequestDraft,
  Copy,
  Layers,
  MoreHorizontal,
  X,
  type LucideIcon
} from "lucide-react"
import { useMemo, useState } from "react"

import { ClearBranchFields } from "@/components/TicketGit/ClearBranchFields"
import { ConnectBranchFields } from "@/components/TicketGit/ConnectBranchFields"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger
} from "@/components/ui/dropdown-menu"
import { InlineForm, useInlineForm } from "@/components/ui/inline-form"
import { projectGitStates, unstackBranch } from "@/features/github/atoms/github"
import { projectRequest } from "@/features/projects/atoms/projects"
import { useProjectActor } from "@/lib/access"
import { cn } from "@/lib/utils"
import { m } from "@/paraglide/messages"

export function useGitStack(
  orgSlug: string,
  slug: string,
  ticket: Pick<Ticket, "id"> &
    Readonly<{ stack?: ReadonlyArray<StackLayerState> | undefined }>
): ReadonlyArray<StackLayerState> {
  const req = useMemo(() => projectRequest(orgSlug, slug), [orgSlug, slug])
  const states = useAtomValue(projectGitStates(req))
  const value = Option.getOrUndefined(Result.value(states))
  return value?.stacks?.[ticket.id] ?? ticket.stack ?? []
}

type LayerTone = "draft" | "open" | "merged" | "closed" | "none" | "deleted"

export const layerTone = (layer: StackLayerState): LayerTone => {
  if (layer.deleted) return "deleted"
  if (layer.pr === null) return "none"
  if (layer.pr.state === "merged") return "merged"
  if (layer.pr.state === "closed") return "closed"
  return layer.pr.draft ? "draft" : "open"
}

const TONES: Readonly<
  Record<LayerTone, Readonly<{ icon: LucideIcon; className: string }>>
> = {
  draft: { icon: GitPullRequestDraft, className: "text-muted-foreground" },
  open: { icon: GitPullRequest, className: "text-state-success" },
  merged: { icon: GitMerge, className: "text-state-merged" },
  closed: { icon: GitPullRequestClosed, className: "text-muted-foreground" },
  none: { icon: GitBranch, className: "text-muted-foreground" },
  deleted: { icon: AlertTriangle, className: "text-state-warning" }
}

const STATE_LABELS: Readonly<
  Record<LayerTone, (layer: StackLayerState) => string>
> = {
  draft: () => m.git_stack_state_draft(),
  open: () => m.git_stack_state_open(),
  merged: () => m.git_stack_state_merged(),
  closed: () => m.git_stack_state_closed(),
  none: () => m.git_stack_state_no_pr(),
  deleted: () => m.git_stack_state_deleted()
}

const CHECKS = {
  failing: {
    label: m.git_stack_checks_failing,
    className: "text-state-danger"
  },
  pending: {
    label: m.git_stack_checks_pending,
    className: "text-state-warning"
  }
} as const

const checksNote = (checks: ChecksStatus | null) =>
  checks === "failing" || checks === "pending" ? CHECKS[checks] : undefined

type PullRequestCount = Readonly<{ merged: number; total: number }>

export const stackPullRequestCount = (
  own: GitState | null,
  stack: ReadonlyArray<StackLayerState>
): PullRequestCount => {
  const ownPr =
    own === null
      ? []
      : own.tag === "pr_merged"
        ? ["merged"]
        : own.tag === "pr_open" ||
            own.tag === "pr_pending" ||
            own.tag === "pr_closed"
          ? ["other"]
          : []
  const layers = stack.flatMap((layer) =>
    layer.pr === null ? [] : [layer.pr.state]
  )
  const all = [...ownPr, ...layers]
  return {
    merged: all.filter((state) => state === "merged").length,
    total: all.length
  }
}

const pendingPr = (number: number, url: string) => ({
  number,
  url,
  title: "",
  state: "open" as const,
  draft: false,
  landed: false,
  checks: null
})

const ownLayer = (
  state: GitState,
  ticket: TicketDetail,
  defaultBase: string
): StackLayerState | null =>
  Match.value(state).pipe(
    Match.when({ tag: "no_branch" }, () => null),
    Match.when({ tag: "stale_branch" }, (current) => ({
      branch: current.name,
      base: null,
      depth: 0,
      pr: null,
      deleted: true
    })),
    Match.when({ tag: "branch_pending" }, (current) => ({
      branch: current.name,
      base: current.baseBranch,
      depth: 0,
      pr: null,
      deleted: false
    })),
    Match.when({ tag: "branch_no_pr" }, (current) => ({
      branch: current.name,
      base: current.baseBranch ?? defaultBase,
      depth: 0,
      pr: null,
      deleted: false
    })),
    Match.when({ tag: "pr_pending" }, (current) => ({
      branch: current.branch,
      base: current.baseBranch,
      depth: 0,
      pr: pendingPr(current.number, current.url),
      deleted: false
    })),
    Match.when({ tag: "pr_open" }, (current) => ({
      branch: current.branch,
      base: current.baseBranch,
      depth: 0,
      pr: {
        ...pendingPr(current.number, current.url),
        title: current.title,
        draft: current.draft,
        checks: current.checks
      },
      deleted: false
    })),
    Match.when({ tag: "pr_merged" }, (current) => ({
      branch: current.branch,
      base: current.baseBranch,
      depth: 0,
      pr: {
        ...pendingPr(current.number, current.url),
        title: current.title,
        state: "merged" as const,
        landed: ticket.lastTransitionedPr === current.number
      },
      deleted: false
    })),
    Match.when({ tag: "pr_closed" }, (current) => ({
      branch: current.branch,
      base: current.baseBranch,
      depth: 0,
      pr: {
        ...pendingPr(current.number, current.url),
        title: current.title,
        state: "closed" as const
      },
      deleted: false
    })),
    Match.exhaustive
  )

const compareUrl = (repoSlug: string, base: string, branch: string): string =>
  `https://github.com/${repoSlug}/compare/${base}...${branch}?quick_pull=1`

type StackAction = "stack" | "clear"

export function StackedBranches({
  orgSlug,
  slug,
  ticket,
  github,
  own,
  stack,
  pulse,
  variant
}: Readonly<{
  orgSlug: string
  slug: string
  ticket: TicketDetail
  github: GithubConnection
  own: GitState
  stack: ReadonlyArray<StackLayerState>
  pulse: boolean
  variant: "bordered" | "ghost"
}>) {
  const canWrite = useProjectActor().call("tickets", "stackBranch")
  const bottom = ownLayer(own, ticket, github.defaultBaseBranch ?? "main")
  const rows = bottom === null ? stack : [bottom, ...stack]
  const count = stackPullRequestCount(own, stack)
  const Root = InlineForm.Root<StackAction>
  return (
    <Root variant={variant}>
      <InlineForm.Idle block>
        <section
          className="flex flex-col gap-1.5"
          aria-label={m.git_stack_heading()}
        >
          <ul className="flex flex-col">
            {rows.map((layer, index) => (
              <StackLayerRow
                key={layer.branch}
                orgSlug={orgSlug}
                slug={slug}
                ticket={ticket}
                layer={layer}
                previousBranch={rows[index - 1]?.branch ?? null}
                first={index === 0}
                last={index === rows.length - 1}
                own={layer === bottom}
                pulse={layer === bottom && pulse}
                repoSlug={`${github.repoOwner}/${github.repoName}`}
                canWrite={canWrite}
              />
            ))}
          </ul>
          <span
            className="inline-flex items-center gap-1 text-[11px] text-muted-foreground"
            title={m.git_stack_count_title(count)}
          >
            <Layers className="size-3" strokeWidth={1.75} aria-hidden />
            {m.git_stack_count(count)}
          </span>
        </section>
      </InlineForm.Idle>
      <InlineForm.Form action="stack">
        <ConnectBranchFields
          orgSlug={orgSlug}
          slug={slug}
          ticket={ticket}
          github={github}
          variant={variant}
          mode="stack"
        />
      </InlineForm.Form>
      <InlineForm.Form action="clear">
        <ClearBranchFields
          orgSlug={orgSlug}
          slug={slug}
          id={ticket.id}
          variant={variant}
        />
      </InlineForm.Form>
    </Root>
  )
}

export function AddStackedBranch({
  orgSlug,
  slug,
  ticket,
  github,
  variant
}: Readonly<{
  orgSlug: string
  slug: string
  ticket: TicketDetail
  github: GithubConnection
  variant: "bordered" | "ghost"
}>) {
  const canWrite = useProjectActor().call("tickets", "stackBranch")
  if (!canWrite) return null
  const Root = InlineForm.Root<"stack">
  return (
    <Root variant="ghost">
      <InlineForm.Idle>
        <InlineForm.Trigger
          action="stack"
          size="xs"
          variant="ghost"
          leadingIcon={Layers}
        >
          {m.git_stack_add_button()}
        </InlineForm.Trigger>
      </InlineForm.Idle>
      <InlineForm.Form action="stack">
        <ConnectBranchFields
          orgSlug={orgSlug}
          slug={slug}
          ticket={ticket}
          github={github}
          variant={variant}
          mode="stack"
        />
      </InlineForm.Form>
    </Root>
  )
}

function BranchMenu({
  layer,
  own,
  repoSlug,
  canWrite,
  busy,
  onRemove
}: Readonly<{
  layer: StackLayerState
  own: boolean
  repoSlug: string
  canWrite: boolean
  busy: boolean
  onRemove: () => void
}>) {
  const { open } = useInlineForm<StackAction>()
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <Button
            variant="ghost"
            size="icon-xs"
            aria-label={m.git_stack_branch_menu_label({ branch: layer.branch })}
          >
            <MoreHorizontal strokeWidth={1.75} />
          </Button>
        }
      />
      <DropdownMenuContent align="end" sideOffset={4} className="w-48">
        <DropdownMenuItem
          onClick={() => void navigator.clipboard.writeText(layer.branch)}
        >
          <Copy strokeWidth={1.75} />
          {m.git_copy_branch_name_label()}
        </DropdownMenuItem>
        {canWrite && layer.pr === null && layer.base !== null && (
          <DropdownMenuItem
            onClick={() =>
              window.open(
                compareUrl(repoSlug, layer.base ?? "", layer.branch),
                "_blank",
                "noreferrer"
              )
            }
          >
            <GitPullRequest strokeWidth={1.75} />
            {m.git_open_pr_button()}
          </DropdownMenuItem>
        )}
        {canWrite && (
          <DropdownMenuItem onClick={() => open("stack")}>
            <Layers strokeWidth={1.75} />
            {m.git_stack_add_button()}
          </DropdownMenuItem>
        )}
        {canWrite &&
          (own ? (
            <DropdownMenuItem onClick={() => open("clear")}>
              <X strokeWidth={1.75} />
              {m.git_stack_clear_branch()}
            </DropdownMenuItem>
          ) : (
            <DropdownMenuItem disabled={busy} onClick={onRemove}>
              <X strokeWidth={1.75} />
              {m.git_stack_remove_item()}
            </DropdownMenuItem>
          ))}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

function StackLayerRow({
  orgSlug,
  slug,
  ticket,
  layer,
  previousBranch,
  first,
  last,
  own,
  pulse,
  repoSlug,
  canWrite
}: Readonly<{
  orgSlug: string
  slug: string
  ticket: TicketDetail
  layer: StackLayerState
  previousBranch: string | null
  first: boolean
  last: boolean
  own: boolean
  pulse: boolean
  repoSlug: string
  canWrite: boolean
}>) {
  const tone = layerTone(layer)
  const { icon: Icon, className } = TONES[tone]
  const label = STATE_LABELS[tone](layer)
  const checks = checksNote(layer.pr?.checks ?? null)
  const title = layer.pr?.title ?? ""
  const request = useMemo(
    () => ({ req: projectRequest(orgSlug, slug), id: ticket.id }),
    [orgSlug, slug, ticket.id]
  )
  const remove = useAtomSet(unstackBranch(request), { mode: "promiseExit" })
  const [failed, setFailed] = useState(false)
  const [busy, setBusy] = useState(false)

  async function onRemove() {
    setBusy(true)
    setFailed(false)
    const exit = await remove({ name: layer.branch })
    setBusy(false)
    if (Exit.isFailure(exit)) setFailed(true)
  }

  const showBase = layer.base !== null && layer.base !== previousBranch
  const notes = [
    ...(tone === "none" || tone === "deleted"
      ? [{ text: label, className }]
      : []),
    ...(checks ? [{ text: checks.label(), className: checks.className }] : [])
  ]
  const hasMeta = title !== "" || showBase || notes.length > 0

  return (
    <li
      className={cn(
        "relative flex items-start gap-2 py-1.5",
        pulse && "animate-pulse"
      )}
    >
      {!first && (
        <span
          aria-hidden
          className="absolute top-0 left-[6.5px] h-1.5 w-px bg-border"
        />
      )}
      {!last && (
        <span
          aria-hidden
          className="absolute top-6 bottom-0 left-[6.5px] w-px bg-border"
        />
      )}
      <span title={label} className="mt-0.5">
        <Icon
          className={cn("size-3.5 shrink-0", className)}
          strokeWidth={1.75}
          aria-hidden
        />
        <span className="sr-only">{label}</span>
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex min-w-0 items-baseline gap-1.5 text-xs">
          {layer.pr !== null && (
            <a
              href={layer.pr.url}
              target="_blank"
              rel="noreferrer"
              className="shrink-0 font-medium hover:underline"
            >
              #{layer.pr.number}
            </a>
          )}
          <span
            className={cn("min-w-0 truncate", title === "" && "font-mono")}
            title={layer.branch}
          >
            {title === "" ? layer.branch : title}
          </span>
        </div>
        {hasMeta && (
          <div className="flex min-w-0 flex-wrap items-baseline gap-x-1.5 text-[11px] text-muted-foreground">
            {title !== "" && (
              <span className="min-w-0 truncate font-mono">{layer.branch}</span>
            )}
            {showBase && (
              <span className="truncate font-mono">
                {m.git_stack_base({ base: layer.base ?? "" })}
              </span>
            )}
            {notes.map((note) => (
              <span key={note.text} className={note.className}>
                {note.text}
              </span>
            ))}
          </div>
        )}
        {failed && (
          <p role="alert" className="text-[11px] text-destructive">
            {m.git_stack_remove_error()}
          </p>
        )}
      </div>
      <BranchMenu
        layer={layer}
        own={own}
        repoSlug={repoSlug}
        canWrite={canWrite}
        busy={busy}
        onRemove={() => void onRemove()}
      />
    </li>
  )
}
