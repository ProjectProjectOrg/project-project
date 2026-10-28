import { menuLabelClass } from "@/components/ui/menu-styles"
import type { BranchListView } from "@/features/github/atoms/github"
import { MenuNote } from "@/features/github/components/MenuNote"
import type { BranchResults } from "@/features/github/hooks/useBranchResults"
import { cn } from "@/lib/utils"
import { m } from "@/paraglide/messages"

export function BranchResultsNote({
  results,
  empty
}: Readonly<{ results: BranchResults; empty: boolean }>) {
  if (results.failed) {
    return <MenuNote tone="error">{m.git_load_branches_error()}</MenuNote>
  }
  if (results.view === null) {
    return <MenuNote>{m.git_branches_loading()}</MenuNote>
  }
  if (empty && !results.loading) {
    return <MenuNote>{m.git_no_branches_found()}</MenuNote>
  }
  return null
}

export function BranchPagingNote({
  view
}: Readonly<{ view: BranchListView | null }>) {
  if (view === null) return null
  if (view.loadingMore) {
    return (
      <p className={menuLabelClass}>{m.git_branch_picker_loading_more()}</p>
    )
  }
  if (!view.hasMore) return null
  return (
    <p className={cn(menuLabelClass, "tabular-nums")}>
      {m.git_branch_picker_count({
        shown: view.items.length,
        total: view.totalCount
      })}
    </p>
  )
}
