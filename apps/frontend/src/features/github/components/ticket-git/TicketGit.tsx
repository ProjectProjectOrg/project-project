import type { GitState, GithubConnection, TicketDetail } from "@pp/shared"

import { StackedBranches } from "@/features/github/components/ticket-git/TicketStack"
import { useTicketGit } from "@/features/github/hooks/useTicketGit"
import { repoSlug } from "@/features/github/lib/repos"
import { useProjectRoute } from "@/features/projects/hooks/useProject"
import { useProjectActor } from "@/hooks/useActor"

import { BranchAttemptError } from "./BranchAttemptError"
import { GitField } from "./GitField"
import { PANEL_CHROME, type GitPanelFrame } from "./gitPanelFrame"
import { NoBranchPanel } from "./NoBranchPanel"

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
      <div className="flex flex-col gap-3">
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
        <BranchAttemptError id={ticket.id} />
      </div>
    )
  }
  if (state === null) {
    return (
      <div className={variant === "bordered" ? PANEL_CHROME : undefined}>
        <div className="h-7 w-44 skeleton rounded bg-muted/60" />
      </div>
    )
  }
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
      <BranchAttemptError id={ticket.id} />
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
    repoSlug: repoSlug(github),
    pulse: (waiting || pending) && "animate-pulse",
    panelChrome: variant === "bordered" ? PANEL_CHROME : undefined
  }

  return state.tag === "no_branch" ? (
    <NoBranchPanel frame={frame} />
  ) : (
    <GitField state={state} frame={frame} />
  )
}
