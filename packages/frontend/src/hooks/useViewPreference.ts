import * as Schema from "effect/Schema"
import { useLayoutEffect, useRef } from "react"
import { useLocalStorageState } from "./useLocalStorageState"

const ViewPreference = Schema.Literals(["list", "board"])

export type ViewPreference = typeof ViewPreference.Type

const viewPreferenceKey = (orgSlug: string, slug: string) =>
  `projectproject:view-preference:${orgSlug}/${slug}`

export function useViewPreference(
  orgSlug: string,
  slug: string
): readonly [ViewPreference, (next: ViewPreference) => void] {
  return useLocalStorageState(
    viewPreferenceKey(orgSlug, slug),
    ViewPreference,
    "list"
  )
}

export type ProjectView = ViewPreference | "description"

export function useProjectView(
  orgSlug: string,
  slug: string,
  searchView: string | undefined
): {
  readonly view: ProjectView
  readonly setPreference: (next: ViewPreference) => void
} {
  const [preference, setPreference] = useViewPreference(orgSlug, slug)
  const fromSearch: ViewPreference | undefined =
    searchView === "list" || searchView === "board" ? searchView : undefined

  const adoptedSearchView = useRef<ViewPreference | undefined>(undefined)
  useLayoutEffect(() => {
    if (fromSearch === undefined || fromSearch === adoptedSearchView.current)
      return
    adoptedSearchView.current = fromSearch
    setPreference(fromSearch)
  }, [fromSearch, setPreference])

  return {
    view: searchView === "description" ? "description" : preference,
    setPreference
  }
}
