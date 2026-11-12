import { useAtomValue } from "@effect/atom-react"
import * as Schema from "effect/Schema"

import { currentUserId } from "@/features/auth/atoms/auth"
import { useProjectRoute } from "@/features/projects/hooks/useProject"
import {
  createLocalStorageCodec,
  useLocalStorageState
} from "@/hooks/useLocalStorageState"

export const DISPLAY_PROPERTIES = [
  "tags",
  "git",
  "blockedBy",
  "blocking",
  "related",
  "duplicates",
  "epic",
  "estimate",
  "sprint",
  "assignee"
] as const

export type DisplayProperty = (typeof DISPLAY_PROPERTIES)[number]

const DEFAULT_HIDDEN: ReadonlyArray<string> = ["related", "duplicates", "tags"]

const hiddenCodec = createLocalStorageCodec(Schema.Array(Schema.String))

export function useDisplayProperties() {
  const { orgSlug, slug } = useProjectRoute()
  const viewerId = useAtomValue(currentUserId)
  const [hidden, setHidden] = useLocalStorageState(
    `projectproject:display-properties:${viewerId ?? ""}:${orgSlug}/${slug}`,
    hiddenCodec,
    DEFAULT_HIDDEN
  )
  return {
    shows: (property: DisplayProperty) => !hidden.includes(property),
    toggle: (property: DisplayProperty) =>
      setHidden(
        hidden.includes(property)
          ? hidden.filter((name) => name !== property)
          : [...hidden, property]
      ),
    isDefault:
      hidden.length === DEFAULT_HIDDEN.length &&
      DEFAULT_HIDDEN.every((name) => hidden.includes(name)),
    reset: () => setHidden(DEFAULT_HIDDEN)
  }
}
