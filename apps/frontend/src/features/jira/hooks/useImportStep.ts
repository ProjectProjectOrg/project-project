import { getRouteApi } from "@tanstack/react-router"
import { useCallback } from "react"

import type { JiraSetupSection } from "@/features/jira/lib/setup"
import type { JiraImportStep } from "@/features/jira/lib/stages"

const routeApi = getRouteApi(
  "/_authed/orgs/$orgSlug/migrations/jira/$migrationId"
)

export type ImportStepControls = Readonly<{
  step: JiraImportStep | undefined
  section: JiraSetupSection | undefined
  reconfigure: boolean
  goTo: (step: JiraImportStep | undefined, section?: JiraSetupSection) => void
  clear: () => void
  openSection: (section: JiraSetupSection | undefined) => void
}>

export function useImportStep(reconfiguring: boolean): ImportStepControls {
  const search = routeApi.useSearch()
  const navigate = routeApi.useNavigate()
  const goTo = useCallback(
    (step: JiraImportStep | undefined, section?: JiraSetupSection) =>
      void navigate({
        search: {
          step,
          section,
          reconfigure: step !== undefined && reconfiguring ? true : undefined
        }
      }),
    [navigate, reconfiguring]
  )
  const clear = useCallback(
    () => void navigate({ search: {}, replace: true }),
    [navigate]
  )
  const openSection = useCallback(
    (section: JiraSetupSection | undefined) =>
      void navigate({
        search: (previous) => ({ ...previous, section }),
        replace: true,
        resetScroll: false
      }),
    [navigate]
  )
  return {
    step: search.step,
    section: search.section,
    reconfigure: search.reconfigure === true,
    goTo,
    clear,
    openSection
  }
}
