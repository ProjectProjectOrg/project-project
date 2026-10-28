import { GitBranch } from "lucide-react"

import { Button } from "@/components/ui/button"
import { BranchPicker } from "@/features/github/components/ticket-git/BranchPicker"
import { cn } from "@/lib/utils"
import { m } from "@/paraglide/messages"

import {
  ACTIONS_STACK,
  GIT_PANEL_CONTAINER,
  IDLE_STACK,
  type GitPanelFrame
} from "./gitPanelFrame"

export function NoBranchPanel({ frame }: Readonly<{ frame: GitPanelFrame }>) {
  const { ticket, github, branchTemplate, canWrite, buttonSize, panelChrome } =
    frame
  return (
    <div className={cn(panelChrome, GIT_PANEL_CONTAINER)}>
      <div className={cn("flex items-center gap-2", IDLE_STACK)}>
        <span className="text-xs text-muted-foreground">
          {m.git_no_branch_yet()}
        </span>
        {canWrite && (
          <div className={cn("ml-auto flex items-center", ACTIONS_STACK)}>
            <BranchPicker
              mode="link"
              ticket={ticket}
              github={github}
              branchTemplate={branchTemplate}
              trigger={
                <Button size={buttonSize} leadingIcon={GitBranch}>
                  {m.git_branch_picker_button()}
                </Button>
              }
            />
          </div>
        )}
      </div>
    </div>
  )
}
