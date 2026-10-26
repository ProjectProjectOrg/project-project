import type { GitState } from "@pp/shared"

import { cn } from "@/lib/utils"
import { m } from "@/paraglide/messages"

import { BranchChip } from "./BranchChip"
import {
  GIT_PANEL_CONTAINER,
  ROW_STACK,
  WRAPPABLE_TEXT,
  type GitPanelFrame
} from "./gitPanelFrame"
import { PrLink } from "./PrLink"

export function PrMergedPanel({
  state,
  frame
}: Readonly<{
  state: Extract<GitState, { tag: "pr_merged" }>
  frame: GitPanelFrame
}>) {
  const { repoSlug, pulse, panelChrome } = frame
  return (
    <div className={cn(panelChrome, GIT_PANEL_CONTAINER)}>
      <div className={cn(ROW_STACK, pulse)}>
        <BranchChip slug={repoSlug} name={state.branch} />
        <PrLink number={state.number} url={state.url} tone="merged" />
        <span className={WRAPPABLE_TEXT}>{m.git_pr_merged_status_note()}</span>
      </div>
    </div>
  )
}
