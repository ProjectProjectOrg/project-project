import { RegistryContext } from "@effect/atom-react"
import * as Effect from "effect/Effect"
import * as Registry from "effect/reactivity/AtomRegistry"
import { useCallback, useContext, useEffect, useRef, useState } from "react"

import { appendMentionPage } from "@/features/editor/lib/mentionPages"
import { isProseQuery } from "@/features/editor/lib/mentionTrigger"
import type {
  MentionCandidate,
  MentionPage,
  MentionProvider
} from "@/features/editor/mentions/registry"

const SEARCH_DEBOUNCE = "200 millis"

export type MentionResultsStatus =
  | "idle"
  | "loading"
  | "searching"
  | "ready"
  | "failed"

export type MentionResults = Readonly<{
  candidates: ReadonlyArray<MentionCandidate>
  status: MentionResultsStatus
  hasMore: boolean
  loadingMore: boolean
  loadMoreFailed: boolean
  loadMore: () => void
}>

type Settled = Readonly<{
  type: MentionProvider["type"]
  query: string
  page: MentionPage
  failed: boolean
  loadingMore: boolean
  loadMoreFailed: boolean
}>

const NONE: ReadonlyArray<MentionCandidate> = []
const EMPTY_PAGE: MentionPage = { candidates: NONE, nextCursor: null }

const extendsDeadEnd = (settled: Settled | null, query: string): boolean =>
  settled !== null &&
  !settled.failed &&
  settled.page.candidates.length === 0 &&
  isProseQuery(settled.query) &&
  query.startsWith(settled.query)

const runSearch = (
  registry: Registry.AtomRegistry,
  search: ReturnType<MentionProvider["search"]>,
  signal: AbortSignal,
  debounce: boolean
): Promise<MentionPage> =>
  Effect.runPromise(
    (debounce
      ? Effect.andThen(Effect.sleep(SEARCH_DEBOUNCE), search)
      : search
    ).pipe(Effect.provideService(Registry.AtomRegistry, registry)),
    { signal }
  )

export function useMentionResults(
  provider: MentionProvider | null,
  query: string | null
): MentionResults {
  const registry = useContext(RegistryContext)
  const [settled, setSettled] = useState<Settled | null>(null)
  const more = useRef<AbortController | null>(null)
  const own =
    settled !== null && provider !== null && settled.type === provider.type
      ? settled
      : null
  const deadEnd = query !== null && extendsDeadEnd(own, query)

  const run = useCallback(
    (
      search: MentionProvider["search"],
      term: string,
      cursor: string | null,
      signal: AbortSignal,
      debounce: boolean
    ) => runSearch(registry, search(term, cursor), signal, debounce),
    [registry]
  )

  useEffect(() => {
    if (provider === null || query === null || deadEnd) return undefined
    more.current?.abort()
    const controller = new AbortController()
    const settle = (page: MentionPage, failed: boolean) => {
      if (controller.signal.aborted) return
      setSettled({
        type: provider.type,
        query,
        page,
        failed,
        loadingMore: false,
        loadMoreFailed: false
      })
    }
    run(provider.search, query, null, controller.signal, query.length > 0).then(
      (page) => settle(page, false),
      () => settle(EMPTY_PAGE, true)
    )
    return () => controller.abort()
  }, [provider, query, deadEnd, run])

  const current = own !== null && own.query === query ? own : null
  const cursor = current?.page.nextCursor ?? null
  const blocked = current === null || current.loadingMore || cursor === null

  const loadMore = useCallback(() => {
    if (blocked || provider === null || current === null || cursor === null) {
      return
    }
    const controller = new AbortController()
    more.current = controller
    const change = (next: (prev: Settled) => Settled) =>
      setSettled((prev) =>
        !controller.signal.aborted &&
        prev !== null &&
        prev.type === current.type &&
        prev.query === current.query
          ? next(prev)
          : prev
      )
    change((prev) => ({ ...prev, loadingMore: true, loadMoreFailed: false }))
    run(provider.search, current.query, cursor, controller.signal, false).then(
      (page) =>
        change((prev) => ({
          ...prev,
          page: appendMentionPage(prev.page, page),
          loadingMore: false
        })),
      () =>
        change((prev) => ({
          ...prev,
          loadingMore: false,
          loadMoreFailed: true
        }))
    )
  }, [blocked, provider, current, cursor, run])

  const base = {
    hasMore: cursor !== null,
    loadingMore: current?.loadingMore ?? false,
    loadMoreFailed: current?.loadMoreFailed ?? false,
    loadMore
  }
  if (provider === null || query === null) {
    return { ...base, candidates: NONE, status: "idle", hasMore: false }
  }
  if (own === null) return { ...base, candidates: NONE, status: "loading" }
  if (deadEnd) {
    return { ...base, candidates: NONE, status: "ready", hasMore: false }
  }
  if (current === null) {
    return { ...base, candidates: own.page.candidates, status: "searching" }
  }
  return {
    ...base,
    candidates: current.page.candidates,
    status: current.failed ? "failed" : "ready"
  }
}
