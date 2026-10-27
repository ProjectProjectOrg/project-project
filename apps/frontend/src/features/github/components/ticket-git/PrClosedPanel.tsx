import type { GitState } from "@pp/shared"
import { GitPullRequest } from "lucide-react"

import { Button } from "@/components/ui/button"
import { compareUrl } from "@/features/github/lib/branchUrl"
import { cn } from "@/lib/utils"
import { m } from "@/paraglide/messages"

import { BranchChip } from "./BranchChip"
import {
  GIT_PANEL_CONTAINER,
  ROW_STACK,
  type GitPanelFrame
} from "./gitPanelFrame"
import { PrLink } from "./PrLink"

export function PrClosedPanel({
  state,
  frame
}: Readonly<{
  state: Extract<GitState, { tag: "pr_closed" }>
  frame: GitPanelFrame
}>) {
  const { github, repoSlug, pulse, panelChrome, buttonSize } = frame
  const baseBranch = state.baseBranch ?? github.defaultBaseBranch ?? "main"
  return (
    <div className={cn(panelChrome, GIT_PANEL_CONTAINER, ROW_STACK)}>
      <div className={cn("flex items-center gap-2", pulse)}>
        <BranchChip slug={repoSlug} name={state.branch} />
        <PrLink number={state.number} url={state.url} tone="closed" />
      </div>
      <div className="ml-auto @max-sm/git-panel:ml-0">
        <Button
          render={
            <a
              href={compareUrl(repoSlug, baseBranch, state.branch)}
              target="_blank"
              rel="noreferrer"
            />
          }
          size={buttonSize}
          variant="tertiary"
          leadingIcon={GitPullRequest}
        >
          {m.git_open_new_pr_button()}
        </Button>
      </div>
    </div>
  )
}
