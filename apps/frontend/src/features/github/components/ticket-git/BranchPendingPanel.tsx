import type { GitState } from "@pp/shared"

import { InlineForm } from "@/components/ui/inline-form"
import { ClearBranchFields } from "@/features/github/components/ticket-git/ClearBranchFields"
import { cn } from "@/lib/utils"
import { m } from "@/paraglide/messages"

import { BranchChip } from "./BranchChip"
import {
  ACTIONS_STACK,
  GIT_PANEL_CONTAINER,
  IDLE_STACK,
  ROW_STACK,
  WRAPPABLE_TEXT,
  type GitPanelFrame
} from "./gitPanelFrame"

type BranchPendingState = Extract<GitState, { tag: "branch_pending" }>

function branchPendingLabel(state: BranchPendingState): string {
  if (state.pendingOperation === "create") {
    return m.git_create_branch_checking()
  }
  if (state.pendingOperation === "connect") {
    return m.git_connect_branch_checking()
  }
  return m.git_live_state_pending()
}

export function BranchPendingPanel({
  state,
  frame
}: Readonly<{ state: BranchPendingState; frame: GitPanelFrame }>) {
  const { ticket, variant, canWrite, repoSlug, pulse, buttonSize } = frame
  const Root = InlineForm.Root<"clear">
  return (
    <Root
      actions={["clear"]}
      key={`branch_pending:${state.name}`}
      variant={variant}
      className={GIT_PANEL_CONTAINER}
    >
      <InlineForm.Idle className={IDLE_STACK}>
        <InlineForm.Display className={cn(pulse)}>
          <div className={ROW_STACK}>
            <BranchChip slug={repoSlug} name={state.name} />
            <span className={WRAPPABLE_TEXT}>{branchPendingLabel(state)}</span>
          </div>
        </InlineForm.Display>
        {canWrite && (
          <InlineForm.Actions className={ACTIONS_STACK}>
            <InlineForm.Trigger
              action="clear"
              size={buttonSize}
              variant="ghost"
            >
              {m.git_clear_branch_button()}
            </InlineForm.Trigger>
          </InlineForm.Actions>
        )}
      </InlineForm.Idle>
      <InlineForm.Form action="clear">
        <ClearBranchFields id={ticket.id} variant={variant} />
      </InlineForm.Form>
    </Root>
  )
}
