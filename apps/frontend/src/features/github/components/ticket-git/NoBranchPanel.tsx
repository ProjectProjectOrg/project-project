import { Plus } from "lucide-react"

import { Button } from "@/components/ui/button"
import { BranchPicker } from "@/features/github/components/ticket-git/BranchPicker"
import { m } from "@/paraglide/messages"

import type { GitPanelFrame } from "./gitPanelFrame"

export function NoBranchPanel({ frame }: Readonly<{ frame: GitPanelFrame }>) {
  const { ticket, github, branchTemplate, canWrite, panelChrome } = frame
  return (
    <div className={panelChrome}>
      {canWrite ? (
        <BranchPicker
          mode="link"
          ticket={ticket}
          github={github}
          branchTemplate={branchTemplate}
          align="start"
          trigger={
            <Button variant="chip">
              <Plus className="size-3.5" strokeWidth={1.75} />
              {m.git_branch_picker_button()}
            </Button>
          }
        />
      ) : (
        <span className="text-xs text-muted-foreground">
          {m.git_no_branch_yet()}
        </span>
      )}
    </div>
  )
}
