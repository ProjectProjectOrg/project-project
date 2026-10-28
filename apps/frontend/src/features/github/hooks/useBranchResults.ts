import {
  useAtom,
  useAtomMount,
  useAtomRefresh,
  useAtomValue
} from "@effect/atom-react"
import { useDebouncedValue } from "@tanstack/react-pacer"
import * as Result from "effect/reactivity/AsyncResult"
import type { UIEvent } from "react"

import {
  branches,
  branchesRequest,
  moreBranchPages,
  type BranchListView
} from "@/features/github/atoms/github"
import {
  branchSearchView,
  sanitizeBranchName,
  shouldLoadMoreBranches
} from "@/features/github/lib/branchPicker"
import { useProjectRoute } from "@/features/projects/hooks/useProject"

const SEARCH_DEBOUNCE_MS = 150

export type BranchResults = Readonly<{
  view: BranchListView | null
  searching: boolean
  failed: boolean
  refresh: () => void
  onScroll: (event: UIEvent<HTMLDivElement>) => void
}>

export function usePreloadBranches() {
  const { orgSlug, slug } = useProjectRoute()
  useAtomMount(branches(branchesRequest(orgSlug, slug, "")))
}

export function useBranchResults(query: string): BranchResults {
  const { orgSlug, slug } = useProjectRoute()
  const term = sanitizeBranchName(query)
  const [debounced] = useDebouncedValue(term, { wait: SEARCH_DEBOUNCE_MS })
  const baseResult = useAtomValue(branches(branchesRequest(orgSlug, slug, "")))
  const base = Result.isSuccess(baseResult) ? baseResult.value : null
  const complete = base !== null && !base.hasMore
  const req = branchesRequest(orgSlug, slug, complete ? "" : debounced)
  const result = useAtomValue(branches(req))
  const refresh = useAtomRefresh(branches(req))
  const [pages, setPages] = useAtom(moreBranchPages(req))
  const current = !complete && debounced === term
  const exact = current && Result.isSuccess(result) ? result.value : null
  const view = branchSearchView({ term, exact, base })

  return {
    view,
    searching: !complete && term !== "" && exact === null,
    failed: current && Result.isFailure(result) && exact === null,
    refresh,
    onScroll: (event) => {
      if (exact === null || !Result.isSuccess(result) || result.waiting) return
      if (!exact.hasMore || exact.loadingMore) return
      if (shouldLoadMoreBranches(event.currentTarget)) setPages(pages + 1)
    }
  }
}
