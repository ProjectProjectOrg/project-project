import { useAtomRefresh } from "@effect/atom-react"

import { localInboxSync } from "@/features/inbox/atoms/localInbox"
import { useVisibleInterval } from "@/hooks/useVisibleInterval"

const POLL_MS = 30_000

export function useInboxSync(immediate: boolean) {
  const refresh = useAtomRefresh(localInboxSync)
  useVisibleInterval(refresh, POLL_MS, true, { immediate })
  return refresh
}
