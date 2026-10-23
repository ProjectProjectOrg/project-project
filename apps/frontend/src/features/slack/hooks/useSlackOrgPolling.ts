import { useAtomRefresh } from "@effect/atom-react"

import { slackOrg, slackOrgRequest } from "@/features/slack/atoms/slack"
import { useVisibleInterval } from "@/hooks/useVisibleInterval"

const POLL_INTERVAL_MS = 30_000

export function useSlackOrgPolling(orgSlug: string, enabled: boolean) {
  const refresh = useAtomRefresh(slackOrg(slackOrgRequest(orgSlug)))
  useVisibleInterval(refresh, POLL_INTERVAL_MS, enabled)
}
