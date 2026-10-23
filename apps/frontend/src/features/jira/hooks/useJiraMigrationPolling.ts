import { useAtomSet } from "@effect/atom-react"
import type { JiraMigrationStatus } from "@pp/shared"
import { useEffect } from "react"

import {
  invalidateJiraProjectsAtom,
  jiraMigrationKey,
  refreshJiraMigrationAtom
} from "@/features/jira/atoms/jiraMigration"
import { isActiveJiraMigration } from "@/features/jira/components/screen"
import { useVisibleInterval } from "@/hooks/useVisibleInterval"

const POLL_INTERVAL_MS = 2_000

export function useJiraMigrationPolling(
  orgSlug: string,
  migrationId: string,
  status: JiraMigrationStatus
) {
  const refresh = useAtomSet(
    refreshJiraMigrationAtom(jiraMigrationKey(orgSlug, migrationId))
  )
  const invalidateProjects = useAtomSet(invalidateJiraProjectsAtom(orgSlug))
  const active = isActiveJiraMigration(status)

  useEffect(() => {
    if (status === "succeeded") invalidateProjects(undefined)
  }, [invalidateProjects, status])

  useVisibleInterval(() => refresh(undefined), POLL_INTERVAL_MS, active)
}
