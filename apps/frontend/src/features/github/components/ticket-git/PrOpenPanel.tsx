import type { GitState } from "@pp/shared"

import { cn } from "@/lib/utils"

import { BranchChip } from "./BranchChip"
import {
  GIT_PANEL_CONTAINER,
  ROW_STACK,
  WRAPPABLE_TEXT,
  type GitPanelFrame
} from "./gitPanelFrame"
import { PrLink } from "./PrLink"

export function PrOpenPanel({
  state,
  frame
}: Readonly<{
  state: Extract<GitState, { tag: "pr_open" }>
  frame: GitPanelFrame
}>) {
  const { repoSlug, pulse, panelChrome } = frame
  return (
    <div className={cn(panelChrome, GIT_PANEL_CONTAINER)}>
      <div className={cn(ROW_STACK, pulse)}>
        <BranchChip slug={repoSlug} name={state.branch} />
        <PrLink
          number={state.number}
          url={state.url}
          tone={state.draft ? "draft" : "open"}
          checks={state.checks}
        />
        <span className={WRAPPABLE_TEXT}>{state.title}</span>
      </div>
    </div>
  )
}
