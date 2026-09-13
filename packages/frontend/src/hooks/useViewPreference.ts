import * as Schema from "effect/Schema"
import { useLayoutEffect, useRef } from "react"
import { useLocalStorageState } from "./useLocalStorageState"

// Temporary home for this preference. Move it into the URL once the search-param
// cleanup lands, so a shared link carries the view the sender was looking at.
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

  // Adopt the URL only when it actually changes. Keying off `preference` instead
  // would let a stale param overwrite the choice the user just made, before the
  // navigation that carries it has landed.
  const adopted = useRef<ViewPreference | undefined>(undefined)
  useLayoutEffect(() => {
    if (fromSearch === undefined || fromSearch === adopted.current) return
    adopted.current = fromSearch
    setPreference(fromSearch)
  }, [fromSearch, setPreference])

  return {
    view: searchView === "description" ? "description" : preference,
    setPreference
  }
}
