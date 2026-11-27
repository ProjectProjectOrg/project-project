import { useAtomRefresh } from "@effect/atom-react"
import { useVisibleInterval } from "@pp/ui/hooks/useVisibleInterval"

import {
  inboxCount,
  inboxCountRequest,
  inboxEntries,
  inboxRequest
} from "@/features/inbox/atoms/inbox"

const POLL_INTERVAL_MS = 60_000

export function useInboxPolling(orgSlug: string, pages = 1) {
  const refresh = useAtomRefresh(inboxEntries(inboxRequest(orgSlug, pages)))
  useVisibleInterval(refresh, POLL_INTERVAL_MS, true)
}

export function useInboxCountPolling(orgSlug: string) {
  const refresh = useAtomRefresh(inboxCount(inboxCountRequest(orgSlug)))
  useVisibleInterval(refresh, POLL_INTERVAL_MS, true)
}
