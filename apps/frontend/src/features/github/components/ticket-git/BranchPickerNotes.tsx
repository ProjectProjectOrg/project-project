import type { ReactNode } from "react"

import { menuLabelClass } from "@/components/ui/menu-styles"
import { MenuNote } from "@/features/github/components/MenuNote"
import type { BranchResults } from "@/features/github/hooks/useBranchResults"
import { cn } from "@/lib/utils"
import { m } from "@/paraglide/messages"

export function BranchResultsFrame({
  results,
  empty,
  children
}: Readonly<{ results: BranchResults; empty: boolean; children: ReactNode }>) {
  return (
    <div className="flex h-64 flex-col">
      <BranchResultsNote results={results} empty={empty} />
      {children}
    </div>
  )
}

function BranchResultsNote({
  results,
  empty
}: Readonly<{ results: BranchResults; empty: boolean }>) {
  if (results.failed) {
    return <MenuNote tone="error">{m.git_load_branches_error()}</MenuNote>
  }
  if (results.view === null) {
    return <MenuNote>{m.git_branches_loading()}</MenuNote>
  }
  if (empty && !results.searching) {
    return <MenuNote>{m.git_no_branches_found()}</MenuNote>
  }
  return null
}

export function BranchPagingNote({
  results
}: Readonly<{ results: BranchResults }>) {
  return (
    <p aria-live="polite" className={cn(menuLabelClass, "h-7 tabular-nums")}>
      {pagingText(results)}
    </p>
  )
}

const pagingText = ({ view, searching }: BranchResults): string => {
  if (view === null) return ""
  if (searching) return m.git_branch_picker_searching()
  if (view.loadingMore) return m.git_branch_picker_loading_more()
  if (view.hasMore) {
    return m.git_branch_picker_count({
      shown: view.items.length,
      total: view.totalCount
    })
  }
  if (view.items.length === 0) return ""
  return m.git_branch_picker_total({ count: view.items.length })
}
