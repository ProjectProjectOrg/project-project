import { useAtomValue } from "@effect/atom-react"

import { currentUserId } from "@/features/auth/atoms/auth"
import { TimelineOrder } from "@/features/tickets/lib/timeline"
import {
  createLocalStorageCodec,
  useLocalStorageState
} from "@/hooks/useLocalStorageState"

const orderCodec = createLocalStorageCodec(TimelineOrder)

export function useActivityOrder() {
  const viewerId = useAtomValue(currentUserId)
  return useLocalStorageState(
    `projectproject:activity-order:${viewerId ?? ""}`,
    orderCodec,
    "asc"
  )
}
