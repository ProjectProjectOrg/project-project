import { RegistryContext } from "@effect/atom-react"
import * as Effect from "effect/Effect"
import * as Registry from "effect/reactivity/AtomRegistry"
import { useCallback, useContext, useEffect, useRef, useState } from "react"

import { appendPage, type SearchPage } from "@/lib/searchPages"

const SEARCH_DEBOUNCE = "200 millis"
const NONE: ReadonlyArray<never> = []

export type PagedSearchSource<A, E> = Readonly<{
  key: string
  search: (
    query: string,
    cursor: string | null
  ) => Effect.Effect<SearchPage<A>, E, Registry.AtomRegistry>
  deadEnd?: (emptyQuery: string, query: string) => boolean
}>

export type PagedSearchStatus =
  | "idle"
  | "loading"
  | "searching"
  | "ready"
  | "failed"

export type PagedSearchResults<A> = Readonly<{
  items: ReadonlyArray<A>
  status: PagedSearchStatus
  hasMore: boolean
  loadingMore: boolean
  loadMoreFailed: boolean
  loadMore: () => void
}>

type Settled<A> = Readonly<{
  key: string
  query: string
  page: SearchPage<A>
  failed: boolean
  loadingMore: boolean
  loadMoreFailed: boolean
}>

const runSearch = <A, E>(
  registry: Registry.AtomRegistry,
  search: Effect.Effect<SearchPage<A>, E, Registry.AtomRegistry>,
  signal: AbortSignal,
  debounce: boolean
): Promise<SearchPage<A>> =>
  Effect.runPromise(
    (debounce
      ? Effect.andThen(Effect.sleep(SEARCH_DEBOUNCE), search)
      : search
    ).pipe(Effect.provideService(Registry.AtomRegistry, registry)),
    { signal }
  )

export function usePagedSearch<A extends Readonly<{ id: string }>, E>(
  source: PagedSearchSource<A, E> | null,
  query: string | null
): PagedSearchResults<A> {
  const registry = useContext(RegistryContext)
  const [settled, setSettled] = useState<Settled<A> | null>(null)
  const more = useRef<AbortController | null>(null)
  const own =
    settled !== null && source !== null && settled.key === source.key
      ? settled
      : null
  const deadEnd =
    query !== null &&
    own !== null &&
    !own.failed &&
    own.page.items.length === 0 &&
    (source?.deadEnd?.(own.query, query) ?? false)

  useEffect(() => {
    if (source === null || query === null || deadEnd) return undefined
    more.current?.abort()
    const controller = new AbortController()
    const settle = (page: SearchPage<A>, failed: boolean) => {
      if (controller.signal.aborted) return
      setSettled({
        key: source.key,
        query,
        page,
        failed,
        loadingMore: false,
        loadMoreFailed: false
      })
    }
    runSearch(
      registry,
      source.search(query, null),
      controller.signal,
      query.length > 0
    ).then(
      (page) => settle(page, false),
      () => settle({ items: NONE, nextCursor: null }, true)
    )
    return () => controller.abort()
  }, [source, query, deadEnd, registry])

  const current = own !== null && own.query === query ? own : null
  const cursor = current?.page.nextCursor ?? null
  const blocked = current === null || current.loadingMore || cursor === null

  const loadMore = useCallback(() => {
    if (blocked || source === null || current === null || cursor === null) {
      return
    }
    const controller = new AbortController()
    more.current = controller
    const change = (next: (prev: Settled<A>) => Settled<A>) =>
      setSettled((prev) =>
        !controller.signal.aborted &&
        prev !== null &&
        prev.key === current.key &&
        prev.query === current.query
          ? next(prev)
          : prev
      )
    change((prev) => ({ ...prev, loadingMore: true, loadMoreFailed: false }))
    runSearch(
      registry,
      source.search(current.query, cursor),
      controller.signal,
      false
    ).then(
      (page) =>
        change((prev) => ({
          ...prev,
          page: appendPage(prev.page, page),
          loadingMore: false
        })),
      () =>
        change((prev) => ({
          ...prev,
          loadingMore: false,
          loadMoreFailed: true
        }))
    )
  }, [blocked, source, current, cursor, registry])

  const base = {
    hasMore: cursor !== null,
    loadingMore: current?.loadingMore ?? false,
    loadMoreFailed: current?.loadMoreFailed ?? false,
    loadMore
  }
  if (source === null || query === null) {
    return { ...base, items: NONE, status: "idle", hasMore: false }
  }
  if (own === null) return { ...base, items: NONE, status: "loading" }
  if (deadEnd) return { ...base, items: NONE, status: "ready", hasMore: false }
  if (current === null) {
    return { ...base, items: own.page.items, status: "searching" }
  }
  return {
    ...base,
    items: current.page.items,
    status: current.failed ? "failed" : "ready"
  }
}
