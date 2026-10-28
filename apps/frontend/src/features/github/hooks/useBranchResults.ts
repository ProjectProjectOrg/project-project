import { useAtom, useAtomRefresh, useAtomValue } from "@effect/atom-react"
import type { GithubConnection } from "@pp/shared"
import { useDebouncedValue } from "@tanstack/react-pacer"
import * as Result from "effect/reactivity/AsyncResult"
import { useState, type UIEvent } from "react"

import {
  branches,
  branchesRequest,
  moreBranchPages,
  type BranchListView
} from "@/features/github/atoms/github"
import {
  retainLatest,
  sanitizeBranchName,
  shouldLoadMoreBranches,
  type Retained
} from "@/features/github/lib/branchPicker"
import { useProjectRoute } from "@/features/projects/hooks/useProject"

const SEARCH_DEBOUNCE_MS = 200

export type BranchResults = Readonly<{
  view: BranchListView | null
  loading: boolean
  failed: boolean
  refresh: () => void
  onScroll: (event: UIEvent<HTMLDivElement>) => void
}>

export function useBranchResults(
  github: GithubConnection,
  query: string
): BranchResults {
  const { orgSlug, slug } = useProjectRoute()
  const term = sanitizeBranchName(query)
  const [debounced] = useDebouncedValue(term, { wait: SEARCH_DEBOUNCE_MS })
  const req = branchesRequest(orgSlug, slug, debounced)
  const result = useAtomValue(branches(req))
  const refresh = useAtomRefresh(branches(req))
  const [pages, setPages] = useAtom(moreBranchPages(req))
  const [retained, setRetained] = useState<Retained<BranchListView>>({
    key: github.repoId,
    value: null
  })
  const next = retainLatest(
    retained,
    github.repoId,
    Result.isSuccess(result) ? result.value : null
  )
  if (next.key !== retained.key || next.value !== retained.value) {
    setRetained(next)
  }
  const view = next.value
  const loading =
    Result.isInitial(result) || Result.isWaiting(result) || term !== debounced

  return {
    view,
    loading,
    failed: Result.isFailure(result) && view === null,
    refresh,
    onScroll: (event) => {
      if (!Result.isSuccess(result) || result.waiting) return
      if (!result.value.hasMore || result.value.loadingMore) return
      if (shouldLoadMoreBranches(event.currentTarget)) setPages(pages + 1)
    }
  }
}
