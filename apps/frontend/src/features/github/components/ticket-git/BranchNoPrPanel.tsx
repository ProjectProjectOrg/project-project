import type { GitState } from "@pp/shared"
import { GitPullRequest } from "lucide-react"

import { Button } from "@/components/ui/button"
import { InlineForm } from "@/components/ui/inline-form"
import { ClearBranchFields } from "@/features/github/components/ticket-git/ClearBranchFields"
import { compareUrl } from "@/features/github/lib/branchUrl"
import { cn } from "@/lib/utils"
import { m } from "@/paraglide/messages"

import { BranchChip } from "./BranchChip"
import {
  ACTIONS_STACK,
  GIT_PANEL_CONTAINER,
  IDLE_STACK,
  type GitPanelFrame
} from "./gitPanelFrame"

export function BranchNoPrPanel({
  state,
  frame
}: Readonly<{
  state: Extract<GitState, { tag: "branch_no_pr" }>
  frame: GitPanelFrame
}>) {
  const { ticket, github, variant, canWrite, repoSlug, pulse, buttonSize } =
    frame
  const baseBranch = state.baseBranch ?? github.defaultBaseBranch ?? "main"
  const Root = InlineForm.Root<"clear">
  return (
    <Root
      actions={["clear"]}
      key={`branch_no_pr:${state.name}`}
      variant={variant}
      className={GIT_PANEL_CONTAINER}
    >
      <InlineForm.Idle className={IDLE_STACK}>
        <InlineForm.Display className={cn(pulse)}>
          <BranchChip slug={repoSlug} name={state.name} />
        </InlineForm.Display>
        {canWrite && (
          <InlineForm.Actions className={ACTIONS_STACK}>
            <Button
              render={
                <a
                  href={compareUrl(repoSlug, baseBranch, state.name)}
                  target="_blank"
                  rel="noreferrer"
                />
              }
              size={buttonSize}
              leadingIcon={GitPullRequest}
            >
              {m.git_open_pr_button()}
            </Button>
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
