import { useAtomRefresh, useAtomSet } from "@effect/atom-react"
import type { JiraMigrationStatus } from "@pp/shared"
import { useEffect, useRef } from "react"

import {
  invalidateAfterImport,
  jiraMigration,
  jiraMigrationRequest,
  jiraMigrations,
  jiraOrgRequest
} from "@/features/jira/atoms/jiraMigration"
import { isActiveJiraImport } from "@/features/jira/lib/stages"
import { useVisibleInterval } from "@/hooks/useVisibleInterval"

const POLL_INTERVAL_MS = 2_000

export function useJiraMigrationPolling(
  orgSlug: string,
  migrationId: string,
  status: JiraMigrationStatus
) {
  const refresh = useAtomRefresh(
    jiraMigration(jiraMigrationRequest(orgSlug, migrationId))
  )
  const invalidate = useAtomSet(invalidateAfterImport(jiraOrgRequest(orgSlug)))
  const active = isActiveJiraImport(status)
  const previous = useRef(status)

  useEffect(() => {
    const before = previous.current
    previous.current = status
    if (status === "succeeded" && isActiveJiraImport(before))
      invalidate(undefined)
  }, [invalidate, status])

  useVisibleInterval(refresh, POLL_INTERVAL_MS, active)
}

export function useJiraImportsPolling(orgSlug: string, active: boolean) {
  const refresh = useAtomRefresh(jiraMigrations(jiraOrgRequest(orgSlug)))
  useVisibleInterval(refresh, POLL_INTERVAL_MS * 2, active)
}
