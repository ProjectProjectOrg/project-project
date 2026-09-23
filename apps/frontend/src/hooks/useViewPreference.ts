import * as Schema from "effect/Schema"
import { useLayoutEffect, useRef } from "react"

import { readLocalStorage, useLocalStorageState } from "./useLocalStorageState"

const ViewPreference = Schema.Literals(["list", "board"])

export type ViewPreference = typeof ViewPreference.Type

type ViewScope = "backlog" | "sprints"

const viewPreferenceKey = (orgSlug: string, slug: string, scope: ViewScope) =>
  `projectproject:view-preference:${orgSlug}/${slug}/${scope}`

export function readViewPreference(
  orgSlug: string,
  slug: string,
  scope: ViewScope
): ViewPreference {
  return readLocalStorage(
    viewPreferenceKey(orgSlug, slug, scope),
    ViewPreference,
    "list"
  )
}

export function useViewPreference(
  orgSlug: string,
  slug: string,
  scope: ViewScope
): readonly [ViewPreference, (next: ViewPreference) => void] {
  return useLocalStorageState(
    viewPreferenceKey(orgSlug, slug, scope),
    ViewPreference,
    "list"
  )
}

export type ProjectView = ViewPreference | "description"

export function useProjectView(
  orgSlug: string,
  slug: string,
  searchView: string | undefined,
  scope: ViewScope
): Readonly<{
  view: ProjectView
  setPreference: (next: ViewPreference) => void
}> {
  const [preference, setPreference] = useViewPreference(orgSlug, slug, scope)
  const fromSearch: ViewPreference | undefined =
    searchView === "list" || searchView === "board" ? searchView : undefined

  const adoptedSearchView = useRef<string | undefined>(undefined)
  useLayoutEffect(() => {
    if (fromSearch === undefined) return
    const adoptionKey = `${viewPreferenceKey(orgSlug, slug, scope)}:${fromSearch}`
    if (adoptionKey === adoptedSearchView.current) return
    adoptedSearchView.current = adoptionKey
    setPreference(fromSearch)
  }, [fromSearch, orgSlug, slug, scope, setPreference])

  return {
    view: searchView === "description" ? "description" : preference,
    setPreference
  }
}
