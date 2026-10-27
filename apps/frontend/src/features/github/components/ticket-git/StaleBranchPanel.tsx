import type { GitState } from "@pp/shared"
import { AlertTriangle } from "lucide-react"

import { InlineForm } from "@/components/ui/inline-form"
import { ClearBranchFields } from "@/features/github/components/ticket-git/ClearBranchFields"
import { cn } from "@/lib/utils"
import { m } from "@/paraglide/messages"

import {
  ACTIONS_STACK,
  GIT_PANEL_CONTAINER,
  IDLE_STACK,
  type GitPanelFrame
} from "./gitPanelFrame"

export function StaleBranchPanel({
  state,
  frame
}: Readonly<{
  state: Extract<GitState, { tag: "stale_branch" }>
  frame: GitPanelFrame
}>) {
  const { ticket, variant, canWrite, pulse, buttonSize } = frame
  const Root = InlineForm.Root<"clear">
  return (
    <Root
      actions={["clear"]}
      key={`stale_branch:${state.name}`}
      variant={variant}
      className={GIT_PANEL_CONTAINER}
    >
      <InlineForm.Idle className={IDLE_STACK}>
        <InlineForm.Display className={cn(pulse)}>
          <div className="flex min-w-0 items-start gap-1.5 text-xs text-state-warning">
            <AlertTriangle
              className="mt-0.5 size-3.5 shrink-0"
              strokeWidth={1.75}
            />
            <span className="min-w-0 break-words">
              {m.git_stale_branch_prefix()}{" "}
              <span className="font-mono">{state.name}</span>{" "}
              {m.git_stale_branch_suffix()}
            </span>
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
