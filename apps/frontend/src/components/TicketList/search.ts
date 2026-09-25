import { useDebouncer } from "@tanstack/react-pacer"
import { useState } from "react"

export const MIN_SEARCH_CHARS = 3

export function effectiveTicketSearch(draft: string) {
  return draft.length >= MIN_SEARCH_CHARS ? draft : undefined
}

type SearchDraft = Readonly<{
  scopeKey: string | undefined
  draft: string
  query: string | undefined
  submitted: Readonly<{ query: string | undefined }> | null
  revision: number
}>

export function useTicketSearch(
  query: string | undefined,
  onCommit: (query: string | undefined) => void,
  scopeKey?: string
) {
  const [state, setState] = useState<SearchDraft>({
    scopeKey,
    draft: query ?? "",
    query,
    submitted: null,
    revision: 0
  })

  if (state.query !== query || state.scopeKey !== scopeKey) {
    const ownUpdate =
      state.scopeKey === scopeKey &&
      state.submitted?.query === query &&
      state.submitted !== null
    setState({
      scopeKey,
      draft: ownUpdate ? state.draft : (query ?? ""),
      query,
      submitted: null,
      revision: ownUpdate ? state.revision : state.revision + 1
    })
  }

  const commit = (draft: string) => {
    const nextQuery = effectiveTicketSearch(draft)
    if (nextQuery === query) return
    setState((current) => ({ ...current, submitted: { query: nextQuery } }))
    onCommit(nextQuery)
  }

  const debouncer = useDebouncer(
    (input: { draft: string; revision: number }) => {
      if (input.revision === state.revision && input.draft === state.draft) {
        commit(input.draft)
      }
    },
    { wait: 200 }
  )

  const change = (draft: string) => {
    setState((current) => ({ ...current, draft }))
    debouncer.cancel()
    if (effectiveTicketSearch(draft) !== query) {
      debouncer.maybeExecute({ draft, revision: state.revision })
    }
  }

  const reset = () => {
    debouncer.cancel()
    setState((current) => ({
      ...current,
      draft: "",
      submitted: { query: undefined }
    }))
  }

  const clear = () => {
    reset()
    commit("")
  }

  const flush = () => {
    debouncer.cancel()
    commit(state.draft)
  }

  return { draft: state.draft, change, clear, flush, reset }
}
