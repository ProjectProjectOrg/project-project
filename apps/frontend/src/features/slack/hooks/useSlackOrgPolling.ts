import { useAtomRefresh } from "@effect/atom-react"
import { useEffect } from "react"

import { slackOrg, slackOrgRequest } from "@/features/slack/atoms/slack"

const POLL_INTERVAL_MS = 30_000

export function useSlackOrgPolling(orgSlug: string, enabled: boolean) {
  const refresh = useAtomRefresh(slackOrg(slackOrgRequest(orgSlug)))

  useEffect(() => {
    if (!enabled || typeof document === "undefined") return undefined

    const refreshIfVisible = () => {
      if (document.visibilityState === "visible") refresh()
    }

    const interval = window.setInterval(refreshIfVisible, POLL_INTERVAL_MS)
    document.addEventListener("visibilitychange", refreshIfVisible)
    window.addEventListener("focus", refreshIfVisible)

    return () => {
      window.clearInterval(interval)
      document.removeEventListener("visibilitychange", refreshIfVisible)
      window.removeEventListener("focus", refreshIfVisible)
    }
  }, [enabled, refresh])
}
