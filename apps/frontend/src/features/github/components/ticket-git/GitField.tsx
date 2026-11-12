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
import { canStackOn } from "@/features/github/lib/stacking"
import { textLinkClass } from "@/lib/textLink"
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
  const hasPullRequest = "number" in state
  return (
    <div className={cn(panelChrome, "flex min-w-0 flex-col gap-0.5")}>
      <BranchMenu
        ticket={ticket}
        github={github}
        branch={view.branch}
        openPr={view.openPr}
        removal={{ kind: "ticket" }}
        canStack={canStackOn(state)}
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
            <MiddleTruncate
              value={view.branch}
              className="font-mono text-caption"
            />
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
          "flex min-w-0 items-center gap-1.5 text-micro text-muted-foreground",
          hasPullRequest ? "pl-1" : "pl-2.5",
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
      draggable={false}
      target="_blank"
      rel="noreferrer"
      className={cn("inline-flex items-center gap-0.5", textLinkClass)}
    >
      {children}
      <ArrowUpRight className="size-3" strokeWidth={1.75} />
    </a>
  )
}

const baseNote = (base: string, defaultBase: string) =>
  base === defaultBase ? null : (
    <span className="min-w-0 shrink truncate font-mono" title={base}>
      {m.git_stack_base({ base })}
    </span>
  )

export const pendingLabel = (
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
            {baseNote(s.baseBranch, defaultBase)}
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
            {baseNote(s.baseBranch, defaultBase)}
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
            {baseNote(s.baseBranch, defaultBase)}
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
