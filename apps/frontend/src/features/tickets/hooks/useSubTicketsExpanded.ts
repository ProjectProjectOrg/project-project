import { useAtomValue } from "@effect/atom-react"
import * as Schema from "effect/Schema"

import { currentUserId } from "@/features/auth/atoms/auth"
import { useProjectRoute } from "@/features/projects/hooks/useProject"
import {
  createLocalStorageCodec,
  useLocalStorageState
} from "@/hooks/useLocalStorageState"

const expandedCodec = createLocalStorageCodec(Schema.Boolean)

export function useSubTicketsExpanded() {
  const { orgSlug, slug } = useProjectRoute()
  const viewerId = useAtomValue(currentUserId)
  return useLocalStorageState(
    `projectproject:sub-tickets-expanded:${viewerId ?? ""}:${orgSlug}/${slug}`,
    expandedCodec,
    true
  )
}
