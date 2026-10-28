import type { GitState } from "@pp/shared"
import * as Match from "effect/Match"
import {
  AlertTriangle,
  ArrowUpRight,
  ChevronDown,
  GitBranch,
  LoaderCircle,
  type LucideIcon
} from "lucide-react"
import type { ReactNode } from "react"

import { Button } from "@/components/ui/button"
import { MiddleTruncate } from "@/components/ui/middle-truncate"
import { compareUrl } from "@/features/github/lib/branchUrl"
import { cn } from "@/lib/utils"
import { m } from "@/paraglide/messages"

import { BranchMenu, type BranchMenuPr } from "./BranchMenu"
import type { GitPanelFrame } from "./gitPanelFrame"
import { PrLink } from "./PrLink"

type LinkedState = Exclude<GitState, { tag: "no_branch" }>

type FieldView = Readonly<{
  branch: string
  icon: LucideIcon
  busy: boolean
  openPr: BranchMenuPr | null
  status: ReactNode
}>

export function GitField({
  state,
  frame
}: Readonly<{ state: LinkedState; frame: GitPanelFrame }>) {
  const { ticket, github, repoSlug, pulse, panelChrome } = frame
  const view = fieldView(state, repoSlug, github.defaultBaseBranch ?? "main")
  const Icon = view.icon
  return (
    <div className={cn(panelChrome, "flex min-w-0 flex-col gap-0.5")}>
      <BranchMenu
        ticket={ticket}
        github={github}
        branch={view.branch}
        openPr={view.openPr}
        removal={{ kind: "ticket" }}
        canStack={!view.busy && state.tag !== "stale_branch"}
        trigger={
          <Button
            variant="chip"
            className="max-w-full min-w-0 justify-start"
            aria-busy={view.busy || undefined}
          >
            <Icon
              className={cn(
                "size-3.5 shrink-0",
                view.busy && "motion-safe:animate-spin",
                state.tag === "stale_branch" && "text-state-warning"
              )}
              strokeWidth={1.75}
            />
            <MiddleTruncate value={view.branch} className="font-mono text-xs" />
            <ChevronDown
              className="size-3 shrink-0 text-muted-foreground"
              strokeWidth={1.75}
            />
          </Button>
        }
      />
      <div
        aria-live="polite"
        className={cn(
          "flex min-w-0 items-center gap-1.5 pl-2.5 text-[11px] text-muted-foreground",
          pulse
        )}
      >
        {view.status}
      </div>
    </div>
  )
}

function StatusLink({
  href,
  children
}: Readonly<{ href: string; children: ReactNode }>) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noreferrer"
      className="inline-flex items-center gap-0.5 text-foreground underline decoration-foreground/30 underline-offset-2 transition-colors hover:decoration-foreground"
    >
      {children}
      <ArrowUpRight className="size-3" strokeWidth={1.75} />
    </a>
  )
}

const pendingLabel = (
  state: Extract<GitState, { tag: "branch_pending" }>
): string =>
  Match.value(state.pendingOperation).pipe(
    Match.when("create", () => m.git_create_branch_checking()),
    Match.when("connect", () => m.git_connect_branch_checking()),
    Match.orElse(() => m.git_live_state_pending())
  )

const fieldView = (
  state: LinkedState,
  repoSlug: string,
  defaultBase: string
): FieldView =>
  Match.value(state).pipe(
    Match.discriminatorsExhaustive("tag")({
      branch_pending: (s) => ({
        branch: s.name,
        icon: LoaderCircle,
        busy: true,
        openPr: null,
        status: <span>{pendingLabel(s)}</span>
      }),
      branch_no_pr: (s) => {
        const href = compareUrl(repoSlug, s.baseBranch ?? defaultBase, s.name)
        return {
          branch: s.name,
          icon: GitBranch,
          busy: false,
          openPr: { href, label: m.git_open_pr_button() },
          status: (
            <>
              <span>{m.git_no_pull_request_yet()}</span>
              <span aria-hidden>·</span>
              <StatusLink href={href}>{m.git_open_pr_button()}</StatusLink>
            </>
          )
        }
      },
      pr_pending: (s) => ({
        branch: s.branch,
        icon: GitBranch,
        busy: false,
        openPr: null,
        status: (
          <>
            <PrLink number={s.number} url={s.url} tone="open" />
            <span>{m.git_live_state_pending()}</span>
          </>
        )
      }),
      pr_open: (s) => ({
        branch: s.branch,
        icon: GitBranch,
        busy: false,
        openPr: null,
        status: (
          <>
            <PrLink
              number={s.number}
              url={s.url}
              tone={s.draft ? "draft" : "open"}
              checks={s.checks}
            />
            <span className="min-w-0 truncate" title={s.title}>
              {s.title}
            </span>
          </>
        )
      }),
      pr_merged: (s) => ({
        branch: s.branch,
        icon: GitBranch,
        busy: false,
        openPr: null,
        status: (
          <>
            <PrLink number={s.number} url={s.url} tone="merged" />
            <span>{m.git_pr_merged_status_note()}</span>
          </>
        )
      }),
      pr_closed: (s) => {
        const href = compareUrl(repoSlug, s.baseBranch ?? defaultBase, s.branch)
        return {
          branch: s.branch,
          icon: GitBranch,
          busy: false,
          openPr: { href, label: m.git_open_new_pr_button() },
          status: (
            <>
              <PrLink number={s.number} url={s.url} tone="closed" />
              <span aria-hidden>·</span>
              <StatusLink href={href}>{m.git_open_new_pr_button()}</StatusLink>
            </>
          )
        }
      },
      stale_branch: (s) => ({
        branch: s.name,
        icon: AlertTriangle,
        busy: false,
        openPr: null,
        status: (
          <span className="text-state-warning">
            {m.git_stale_branch_status()}
          </span>
        )
      })
    })
  )
