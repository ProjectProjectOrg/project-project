import { useAtomRefresh, useAtomSet } from "@effect/atom-react"
import type { JiraMigrationStatus } from "@pp/shared"
import { useEffect } from "react"

import {
  invalidateJiraProjects,
  jiraMigration,
  jiraMigrationRequest,
  jiraOrgRequest
} from "@/features/jira/atoms/jiraMigration"
import { isActiveJiraMigration } from "@/features/jira/lib/screen"
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
  const invalidateProjects = useAtomSet(
    invalidateJiraProjects(jiraOrgRequest(orgSlug))
  )
  const active = isActiveJiraMigration(status)

  useEffect(() => {
    if (status === "succeeded") invalidateProjects(undefined)
  }, [invalidateProjects, status])

  useVisibleInterval(refresh, POLL_INTERVAL_MS, active)
}
