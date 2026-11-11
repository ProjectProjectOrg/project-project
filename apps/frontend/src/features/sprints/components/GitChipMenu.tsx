import type {
  GithubConnection,
  GitState,
  StackLayerState,
  Ticket
} from "@pp/shared"
import {
  ArrowUpRight,
  Copy,
  GitBranch,
  GitPullRequestCreateArrow,
  Layers,
  Link as LinkIcon,
  Unlink
} from "lucide-react"
import { Fragment, useRef, useState, type ReactNode } from "react"

import { ConfirmButton } from "@/components/ui/confirm-button"
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuTrigger
} from "@/components/ui/context-menu"
import {
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuGroup,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger
} from "@/components/ui/dropdown-menu"
import { usePreferredBranchLink } from "@/features/github/components/ticket-git/BranchChip"
import { RemoveBranchAction } from "@/features/github/components/ticket-git/BranchMenu"
import { BranchPicker } from "@/features/github/components/ticket-git/BranchPicker"
import {
  layerTone,
  stackPullRequestCount,
  TONES
} from "@/features/github/components/ticket-git/TicketStack"
import { compareUrl } from "@/features/github/lib/branchUrl"
import { canStackOn } from "@/features/github/lib/stacking"
import { useProjectActor } from "@/hooks/useActor"
import { cn } from "@/lib/utils"
import { m } from "@/paraglide/messages"

import {
  CHECKS,
  needsAttention,
  reportedChecks,
  type PullRequest
} from "./gitLooks"

type MenuTicket = Pick<Ticket, "id" | "type" | "title" | "status">

const branchOf = (state: GitState): string | null =>
  state.tag === "no_branch"
    ? null
    : state.tag === "branch_no_pr" ||
        state.tag === "branch_pending" ||
        state.tag === "stale_branch"
      ? state.name
      : state.branch

const pullRequestOf = (state: GitState): PullRequest | null =>
  state.tag === "pr_pending" ||
  state.tag === "pr_open" ||
  state.tag === "pr_merged" ||
  state.tag === "pr_closed"
    ? state
    : null

export function GitChipMenu({
  state,
  stack,
  layers,
  github,
  ticket,
  children
}: Readonly<{
  state: GitState
  stack: ReadonlyArray<StackLayerState>
  layers: ReadonlyArray<StackLayerState>
  github: GithubConnection
  ticket: MenuTicket
  children: ReactNode
}>) {
  const actor = useProjectActor()
  const canClear = actor.call("tickets", "clearBranch")
  const anchor = useRef<HTMLSpanElement>(null)
  const [stacking, setStacking] = useState(false)
  const branch = branchOf(state)
  const pr = pullRequestOf(state)
  const repo = `${github.repoOwner}/${github.repoName}`
  const base = "baseBranch" in state ? state.baseBranch : undefined
  const createPr =
    branch !== null &&
    (state.tag === "branch_no_pr" || state.tag === "pr_closed")
      ? {
          href: compareUrl(
            repo,
            base ?? github.defaultBaseBranch ?? "main",
            branch
          ),
          label:
            state.tag === "pr_closed"
              ? m.git_open_new_pr_button()
              : m.git_open_pr_button()
        }
      : null
  const live =
    state.tag === "branch_no_pr" ||
    state.tag === "branch_pending" ||
    state.tag === "pr_open" ||
    state.tag === "pr_pending"
  const canStack =
    actor.call("tickets", "stackBranch") &&
    (stack.length > 0 || canStackOn(state))

  const sections = [
    stack.length > 0 ? (
      <StackPullRequests
        key="stack"
        own={state}
        stack={stack}
        layers={layers}
      />
    ) : (
      (createPr !== null || pr !== null || branch !== null) && (
        <Fragment key="open">
          {createPr !== null && (
            <DropdownMenuItem
              render={
                <a
                  href={createPr.href}
                  target="_blank"
                  rel="noreferrer"
                  aria-label={createPr.label}
                />
              }
            >
              <GitPullRequestCreateArrow strokeWidth={1.75} />
              {createPr.label}
            </DropdownMenuItem>
          )}
          {pr !== null && (
            <DropdownMenuItem
              render={
                <a
                  href={pr.url}
                  target="_blank"
                  rel="noreferrer"
                  aria-label={m.tickets_command_open_pr()}
                />
              }
            >
              <ArrowUpRight strokeWidth={1.75} />
              {m.tickets_command_open_pr()}
            </DropdownMenuItem>
          )}
          {branch !== null && live && (
            <OpenBranchItem repo={repo} branch={branch} />
          )}
          {branch !== null && (
            <DropdownMenuItem
              onClick={() => void navigator.clipboard.writeText(branch)}
            >
              <Copy strokeWidth={1.75} />
              {m.git_copy_branch_name_label()}
            </DropdownMenuItem>
          )}
          {pr !== null && pr.tag !== "pr_closed" && (
            <DropdownMenuItem
              onClick={() => void navigator.clipboard.writeText(pr.url)}
            >
              <LinkIcon strokeWidth={1.75} />
              {m.git_copy_pr_link_label()}
            </DropdownMenuItem>
          )}
        </Fragment>
      )
    ),
    canStack && (
      <DropdownMenuItem key="stack-add" onClick={() => setStacking(true)}>
        <Layers strokeWidth={1.75} />
        {m.git_stack_add_button()}
      </DropdownMenuItem>
    ),
    canClear && (
      <ConfirmButton.MenuItem key="remove" variant="destructive">
        <Unlink strokeWidth={1.75} />
        {m.git_branch_remove_item()}
      </ConfirmButton.MenuItem>
    )
  ].filter((section) => section !== false)

  return (
    <ConfirmButton.Root bare>
      <ContextMenu>
        <ContextMenuTrigger
          render={
            <span
              ref={anchor}
              className="inline-flex max-w-full min-w-0"
              onContextMenu={(event) => event.stopPropagation()}
            />
          }
        >
          {children}
        </ContextMenuTrigger>
        <ContextMenuContent className="w-56">
          {sections.map((section, index) => (
            <Fragment key={section.key}>
              {index > 0 && <DropdownMenuSeparator />}
              {section}
            </Fragment>
          ))}
        </ContextMenuContent>
      </ContextMenu>
      {canStack && (
        <BranchPicker
          mode="stack"
          ticket={ticket}
          github={github}
          anchor={anchor}
          align="start"
          open={stacking}
          onOpenChange={setStacking}
        />
      )}
      {canClear && (
        <ConfirmButton.Popover anchor={anchor} className="w-72">
          <RemoveBranchAction ticket={ticket} />
        </ConfirmButton.Popover>
      )}
    </ConfirmButton.Root>
  )
}

function OpenBranchItem({
  repo,
  branch
}: Readonly<{ repo: string; branch: string }>) {
  const link = usePreferredBranchLink(repo, branch)
  return (
    <DropdownMenuItem
      render={
        <a
          href={link.href}
          target={link.target}
          rel={link.rel}
          aria-label={m.git_open_branch_item()}
        />
      }
    >
      <GitBranch strokeWidth={1.75} />
      {m.git_open_branch_item()}
    </DropdownMenuItem>
  )
}

function StackPullRequests({
  own,
  stack,
  layers
}: Readonly<{
  own: GitState
  stack: ReadonlyArray<StackLayerState>
  layers: ReadonlyArray<StackLayerState>
}>) {
  const count = stackPullRequestCount(own, stack)
  return (
    <DropdownMenuSub>
      <DropdownMenuSubTrigger>
        <ArrowUpRight strokeWidth={1.75} />
        {m.git_open_pull_requests_item()}
      </DropdownMenuSubTrigger>
      <DropdownMenuSubContent className="w-64">
        <DropdownMenuGroup>
          <DropdownMenuLabel>
            {m.git_stack_count_title(count)}
          </DropdownMenuLabel>
          {layers.map((layer) => (
            <StackLayerItem key={layer.branch} layer={layer} />
          ))}
        </DropdownMenuGroup>
      </DropdownMenuSubContent>
    </DropdownMenuSub>
  )
}

function StackLayerItem({ layer }: Readonly<{ layer: StackLayerState }>) {
  const tone = layerTone(layer)
  const { icon: Icon, className } = TONES[tone]
  const checks = reportedChecks(layer.pr?.checks ?? undefined)
  if (layer.pr === null) {
    return (
      <DropdownMenuItem disabled>
        <Icon className={className} strokeWidth={1.75} />
        <span className="min-w-0 truncate font-mono text-caption">
          {layer.branch}
        </span>
      </DropdownMenuItem>
    )
  }
  return (
    <PullRequestItem
      href={layer.pr.url}
      number={layer.pr.number}
      title={layer.pr.title === "" ? layer.branch : layer.pr.title}
      icon={<Icon className={className} strokeWidth={1.75} />}
      dot={
        tone !== "merged" && needsAttention(checks) ? CHECKS[checks].tone : null
      }
    />
  )
}

function PullRequestItem({
  href,
  number,
  title,
  icon,
  dot
}: Readonly<{
  href: string
  number: number
  title: string
  icon: ReactNode
  dot: string | null
}>) {
  return (
    <DropdownMenuItem
      render={
        <a
          href={href}
          target="_blank"
          rel="noreferrer"
          aria-label={`#${number} ${title}`}
        />
      }
    >
      {icon}
      <span className="shrink-0 font-mono text-caption tabular-nums">
        #{number}
      </span>
      <span className="min-w-0 flex-1 truncate text-foreground">{title}</span>
      {dot !== null && (
        <span
          aria-hidden
          className={cn("size-1.5 shrink-0 rounded-full bg-current", dot)}
        />
      )}
    </DropdownMenuItem>
  )
}
