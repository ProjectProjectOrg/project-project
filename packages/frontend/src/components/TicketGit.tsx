// TicketGit — UI surfaces for a ticket's GitHub state.
//
// Two exports:
//   TicketGitChip  — tiny badge for collapsed list rows (unchanged)
//   TicketGitPanel — full inline panel for the expanded ticket view, built
//                    on top of <InlineForm> with three to four actions per
//                    state (create / connect / open_pr / clear).

import { Result, useAtomValue } from "@effect-atom/atom-react"
import {
  AlertTriangle,
  ArrowUpRight,
  Check,
  Circle,
  Copy,
  GitBranch,
  GitMerge,
  GitPullRequest,
  GitPullRequestClosed,
  Plus
} from "lucide-react"
import { useState } from "react"
import { projectGitStatesAtom } from "@/atoms/github"
import { ClearBranchFields } from "@/components/TicketGit/ClearBranchFields"
import { ConnectBranchFields } from "@/components/TicketGit/ConnectBranchFields"
import { CreateBranchFields } from "@/components/TicketGit/CreateBranchFields"
import { OpenPrConfirm } from "@/components/TicketGit/OpenPrFields"
import { ConfirmButton } from "@/components/ui/confirm-button"
import { InlineForm } from "@/components/ui/inline-form"
import { cn } from "@/lib/utils"
import type {
  GitState,
  GithubConnection,
  TicketDetail,
  TicketId
} from "@projectproject/shared"

// --- Helpers --------------------------------------------------------------

// Returns the per-ticket GitState plus a `waiting` flag reflecting whether
// any in-flight optimistic mutation is touching this project's git states.
// The flag drives the pulse animation on the chip + branch displays so the
// user sees their action land instantly while the server roundtrip resolves.
function useGitState(
  slug: string,
  ticketId: string
): { state: GitState | null; waiting: boolean } {
  const states = useAtomValue(projectGitStatesAtom(slug))
  if (!Result.isSuccess(states)) return { state: null, waiting: false }
  return {
    state: states.value.states[ticketId] ?? null,
    waiting: states.waiting
  }
}

function truncate(name: string, max = 18) {
  return name.length > max ? `${name.slice(0, max - 1)}…` : name
}

function checksColor(s: string): string {
  if (s === "passing") return "text-emerald-500"
  if (s === "failing") return "text-red-500"
  if (s === "pending") return "text-amber-500"
  return "text-muted-foreground"
}

// --- TicketGitChip --------------------------------------------------------

export function TicketGitChip({
  slug,
  ticketId
}: {
  slug: string
  ticketId: TicketId
}) {
  const { state, waiting } = useGitState(slug, ticketId)
  if (!state || state.tag === "no_branch") return null
  const pulse = waiting && "animate-pulse"

  if (state.tag === "stale_branch") {
    return (
      <span
        className={cn(
          "inline-flex items-center gap-1 rounded-md bg-amber-500/10 px-1.5 py-0.5 text-[11px] font-medium text-amber-700 dark:text-amber-400",
          pulse
        )}
        title={`Branch "${state.name}" not on remote`}
      >
        <AlertTriangle className="size-3" strokeWidth={1.75} />
        stale
      </span>
    )
  }

  if (state.tag === "branch_no_pr") {
    return (
      <span
        className={cn(
          "inline-flex items-center gap-1 rounded-md bg-muted px-1.5 py-0.5 font-mono text-[11px] text-muted-foreground",
          pulse
        )}
        title={state.name}
      >
        <GitBranch className="size-3" strokeWidth={1.75} />
        {truncate(state.name)}
      </span>
    )
  }

  if (state.tag === "pr_open") {
    const checkColor = checksColor(state.checks)
    return (
      <span
        className={cn(
          "inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[11px] font-medium",
          state.draft
            ? "bg-muted text-muted-foreground"
            : "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400",
          pulse
        )}
        title={state.title}
      >
        <GitPullRequest className="size-3" strokeWidth={1.75} />#{state.number}
        {state.checks !== "none" && (
          <Circle
            className={cn("size-2 fill-current", checkColor)}
            strokeWidth={0}
          />
        )}
        {state.draft && <span>draft</span>}
      </span>
    )
  }

  if (state.tag === "pr_merged") {
    return (
      <span
        className={cn(
          "inline-flex items-center gap-1 rounded-md bg-violet-500/10 px-1.5 py-0.5 text-[11px] font-medium text-violet-700 dark:text-violet-400",
          pulse
        )}
        title={state.title}
      >
        <GitMerge className="size-3" strokeWidth={1.75} />#{state.number}
      </span>
    )
  }

  if (state.tag === "pr_closed") {
    return (
      <span
        className={cn(
          "inline-flex items-center gap-1 rounded-md bg-muted px-1.5 py-0.5 text-[11px] font-medium text-muted-foreground",
          pulse
        )}
        title={state.title}
      >
        <GitPullRequestClosed className="size-3" strokeWidth={1.75} />#
        {state.number}
      </span>
    )
  }

  return null
}

// --- TicketGitPanel -------------------------------------------------------

export function TicketGitPanel({
  slug,
  ticket,
  github,
  branchTemplate
}: {
  slug: string
  ticket: TicketDetail
  github: GithubConnection | null
  branchTemplate: string | null
}) {
  const { state, waiting } = useGitState(slug, ticket.id)
  if (!github) return null
  if (state === null) {
    return (
      <div className="rounded-lg border border-border bg-background px-3 py-2">
        <div className="skeleton h-7 w-44 rounded bg-muted/60" />
      </div>
    )
  }
  return (
    <PanelForState
      slug={slug}
      ticket={ticket}
      state={state}
      waiting={waiting}
      github={github}
      branchTemplate={branchTemplate}
    />
  )
}

function PanelForState({
  slug,
  ticket,
  state,
  waiting,
  github,
  branchTemplate
}: {
  slug: string
  ticket: TicketDetail
  state: GitState
  waiting: boolean
  github: GithubConnection
  branchTemplate: string | null
}) {
  const repoSlug = `${github.repoOwner}/${github.repoName}`
  // Pulse the optimistic-state indicators (chip + branch + PR link) while the
  // server-truth roundtrip is in flight. Idle controls (triggers, buttons)
  // are NOT pulsed — only the data display is uncertain.
  const pulse = waiting && "animate-pulse"

  if (state.tag === "no_branch") {
    type NoBranchAction = "create" | "connect"
    const Root = InlineForm.Root<NoBranchAction>
    const baseBranch = github.defaultBaseBranch ?? "main"
    return (
      <Root>
        <InlineForm.Idle>
          <InlineForm.Display<NoBranchAction>
            previews={{
              create: (
                <span className="text-xs text-muted-foreground">
                  Create a new branch from{" "}
                  <span className="font-mono text-foreground">
                    {baseBranch}
                  </span>
                </span>
              ),
              connect: (
                <span className="text-xs text-muted-foreground">
                  Attach an existing branch from this repo
                </span>
              )
            }}
          >
            <span className="text-xs text-muted-foreground">No branch yet.</span>
          </InlineForm.Display>
          <InlineForm.Actions>
            <InlineForm.Trigger action="create" size="sm" leadingIcon={Plus}>
              Create branch
            </InlineForm.Trigger>
            <InlineForm.Trigger
              action="connect"
              size="sm"
              variant="tertiary"
              leadingIcon={GitBranch}
            >
              Connect branch
            </InlineForm.Trigger>
          </InlineForm.Actions>
        </InlineForm.Idle>
        <InlineForm.Form action="create">
          <CreateBranchFields
            slug={slug}
            ticket={ticket}
            github={github}
            branchTemplate={branchTemplate}
          />
        </InlineForm.Form>
        <InlineForm.Form action="connect">
          <ConnectBranchFields slug={slug} ticket={ticket} />
        </InlineForm.Form>
      </Root>
    )
  }

  if (state.tag === "branch_no_pr") {
    // Two actions on this state: "Open PR" (parametric — title + draft
    // choice) and "Clear" (destructive). Open PR is a ConfirmButton because
    // its inputs fit inline with the row; Clear stays an InlineForm body so
    // its confirm copy ("Clear branch from this ticket?") gets its own
    // breathing room.
    const Root = InlineForm.Root<"clear">
    return (
      <Root>
        <InlineForm.Idle>
          <InlineForm.Display className={cn(pulse)}>
            <BranchChip slug={repoSlug} name={state.name} />
          </InlineForm.Display>
          <InlineForm.Actions>
            <ConfirmButton.Root>
              <ConfirmButton.Trigger
                size="sm"
                leadingIcon={GitPullRequest}
              >
                Open PR
              </ConfirmButton.Trigger>
              <ConfirmButton.Confirm className="flex-wrap">
                <OpenPrConfirm
                  slug={slug}
                  ticket={ticket}
                  branch={state.name}
                />
              </ConfirmButton.Confirm>
            </ConfirmButton.Root>
            <InlineForm.Trigger action="clear" size="sm" variant="ghost">
              Clear
            </InlineForm.Trigger>
          </InlineForm.Actions>
        </InlineForm.Idle>
        <InlineForm.Form action="clear">
          <ClearBranchFields slug={slug} id={ticket.id} />
        </InlineForm.Form>
      </Root>
    )
  }

  if (state.tag === "pr_open") {
    return (
      <div className="rounded-lg border border-border bg-background px-3 py-2">
        <div
          className={cn("flex flex-wrap items-center gap-2", pulse)}
        >
          <BranchChip slug={repoSlug} name={state.branch} />
          <PrLink
            number={state.number}
            url={state.url}
            tone={state.draft ? "draft" : "open"}
            checks={state.checks}
          />
          <span className="text-xs text-muted-foreground truncate">
            {state.title}
          </span>
        </div>
      </div>
    )
  }

  if (state.tag === "pr_merged") {
    return (
      <div className="rounded-lg border border-border bg-background px-3 py-2">
        <div
          className={cn("flex flex-wrap items-center gap-2", pulse)}
        >
          <BranchChip slug={repoSlug} name={state.branch} />
          <PrLink number={state.number} url={state.url} tone="merged" />
          <span className="text-xs text-muted-foreground">
            merged · ticket auto-set to done
          </span>
        </div>
      </div>
    )
  }

  if (state.tag === "pr_closed") {
    // Single action — full ConfirmButton without a wrapping InlineForm.Root.
    return (
      <div className="flex flex-wrap items-center gap-2 rounded-lg border border-border bg-background px-3 py-2">
        <div className={cn("flex items-center gap-2", pulse)}>
          <BranchChip slug={repoSlug} name={state.branch} />
          <PrLink number={state.number} url={state.url} tone="closed" />
        </div>
        <div className="ml-auto flex items-center gap-2">
          <ConfirmButton.Root>
            <ConfirmButton.Trigger
              size="sm"
              variant="tertiary"
              leadingIcon={GitPullRequest}
            >
              Open new PR
            </ConfirmButton.Trigger>
            <ConfirmButton.Confirm className="flex-wrap">
              <OpenPrConfirm
                slug={slug}
                ticket={ticket}
                branch={state.branch}
              />
            </ConfirmButton.Confirm>
          </ConfirmButton.Root>
        </div>
      </div>
    )
  }

  if (state.tag === "stale_branch") {
    const Root = InlineForm.Root<"clear">
    return (
      <Root>
        <InlineForm.Idle>
          <InlineForm.Display className={cn(pulse)}>
            <span className="inline-flex items-center gap-1.5 text-xs text-amber-700 dark:text-amber-400">
              <AlertTriangle className="size-3.5" strokeWidth={1.75} />
              Branch <span className="font-mono">{state.name}</span> not on remote.
            </span>
          </InlineForm.Display>
          <InlineForm.Actions>
            <InlineForm.Trigger action="clear" size="sm" variant="ghost">
              Clear
            </InlineForm.Trigger>
          </InlineForm.Actions>
        </InlineForm.Idle>
        <InlineForm.Form action="clear">
          <ClearBranchFields slug={slug} id={ticket.id} />
        </InlineForm.Form>
      </Root>
    )
  }

  return null
}

// Branch chip — click the name to open GitHub, click the copy icon to grab
// the branch name for `git checkout`. The copy button appears on hover so
// the chip stays calm at rest. Sticking the two interactions side-by-side
// (rather than splitting the chip) keeps the visual unit intact while
// giving each affordance a distinct hit target.
function BranchChip({ slug, name }: { slug: string; name: string }) {
  const [copied, setCopied] = useState(false)

  async function copy(e: React.MouseEvent) {
    // The chip is a flex row, not a wrapping link — but the copy button
    // sits *inside* the same row. stopPropagation guards against any future
    // wrapper (e.g. a row click handler) hijacking the copy.
    e.stopPropagation()
    e.preventDefault()
    try {
      await navigator.clipboard.writeText(name)
      setCopied(true)
      window.setTimeout(() => setCopied(false), 1200)
    } catch {
      // Clipboard can fail in non-secure contexts; silently no-op rather
      // than throwing — the link still works as a fallback.
    }
  }

  return (
    <span className="group/branch-chip inline-flex items-center gap-0.5 rounded-md bg-muted pr-0.5 font-mono text-xs text-muted-foreground transition-colors hover:text-foreground">
      <a
        href={`https://github.com/${slug}/tree/${name}`}
        target="_blank"
        rel="noreferrer"
        className="inline-flex items-center gap-1 rounded-md py-0.5 pl-1.5 transition-colors hover:text-foreground"
      >
        <GitBranch className="size-3" strokeWidth={1.75} />
        {name}
        <ArrowUpRight className="size-3" strokeWidth={1.75} />
      </a>
      <button
        type="button"
        onClick={copy}
        aria-label={copied ? "Copied" : "Copy branch name"}
        title={copied ? "Copied" : "Copy branch name"}
        className={cn(
          "grid size-5 shrink-0 place-items-center rounded transition-colors hover:bg-background hover:text-foreground",
          // Stay hidden until the row is hovered — avoids clutter at rest.
          // Always-visible while in the "copied" state so the user catches
          // the confirmation even if their cursor has drifted.
          copied
            ? "opacity-100"
            : "opacity-0 group-hover/branch-chip:opacity-100 focus-visible:opacity-100"
        )}
      >
        {copied ? (
          <Check
            className="size-3 text-emerald-500"
            strokeWidth={2}
          />
        ) : (
          <Copy className="size-3" strokeWidth={1.75} />
        )}
      </button>
    </span>
  )
}

function PrLink({
  number,
  url,
  tone,
  checks
}: {
  number: number
  url: string
  tone: "open" | "draft" | "merged" | "closed"
  checks?: string
}) {
  const tint =
    tone === "merged"
      ? "bg-violet-500/10 text-violet-700 dark:text-violet-400"
      : tone === "closed"
        ? "bg-muted text-muted-foreground"
        : tone === "draft"
          ? "bg-muted text-muted-foreground"
          : "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400"
  const Icon =
    tone === "merged"
      ? GitMerge
      : tone === "closed"
        ? GitPullRequestClosed
        : GitPullRequest
  return (
    <a
      href={url}
      target="_blank"
      rel="noreferrer"
      className={cn(
        "inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-xs font-medium",
        tint
      )}
    >
      <Icon className="size-3" strokeWidth={1.75} />#{number}
      {checks && checks !== "none" && (
        <Circle
          className={cn("size-2 fill-current", checksColor(checks))}
          strokeWidth={0}
        />
      )}
      {tone === "draft" && <span>draft</span>}
    </a>
  )
}
