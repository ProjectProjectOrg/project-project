import { useAtomRefresh } from "@effect/atom-react"
import { useVisibleInterval } from "@pp/ui/hooks/useVisibleInterval"

import { slackOrg, slackOrgRequest } from "@/features/slack/atoms/slack"

const POLL_INTERVAL_MS = 30_000

export function useSlackOrgPolling(orgSlug: string, enabled: boolean) {
  const refresh = useAtomRefresh(slackOrg(slackOrgRequest(orgSlug)))
  useVisibleInterval(refresh, POLL_INTERVAL_MS, enabled)
}
