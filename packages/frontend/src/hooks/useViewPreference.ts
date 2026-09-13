import * as Schema from "effect/Schema"
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
