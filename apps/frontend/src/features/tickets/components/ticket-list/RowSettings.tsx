import { useAtomValue } from "@effect/atom-react"
import * as Result from "effect/reactivity/AsyncResult"
import { createContext, use, useMemo, type ReactNode } from "react"

import { statusesFor } from "@/features/projects/atoms/projectStatuses"
import { useProjectRoute } from "@/features/projects/hooks/useProject"
import { sprintMembership } from "@/features/sprints/atoms/sprintList"
import {
  DISPLAY_PROPERTIES,
  useDisplayProperties
} from "@/features/tickets/hooks/useDisplayProperties"
import { useEstimationMode } from "@/features/tickets/hooks/useEstimationMode"

function useSettings() {
  const { statusesReq, sprintListReq } = useProjectRoute()
  const { shows } = useDisplayProperties()
  const estimation = useEstimationMode()
  const statuses = useAtomValue(statusesFor(statusesReq))
  const membership = useAtomValue(sprintMembership(sprintListReq))
  const shown = DISPLAY_PROPERTIES.filter(shows).join(" ")
  return useMemo(() => {
    const visible = new Set(shown.split(" "))
    return {
      shows: (property: (typeof DISPLAY_PROPERTIES)[number]) =>
        visible.has(property),
      estimation,
      statuses: Result.isSuccess(statuses) ? statuses.value : [],
      membership: Result.isSuccess(membership) ? membership.value : null
    }
  }, [shown, estimation, statuses, membership])
}

const RowSettingsContext = createContext<ReturnType<typeof useSettings> | null>(
  null
)

export function RowSettings({ children }: Readonly<{ children: ReactNode }>) {
  const settings = useSettings()
  return <RowSettingsContext value={settings}>{children}</RowSettingsContext>
}

export function useRowSettings() {
  const settings = use(RowSettingsContext)
  if (settings === null) throw new Error("Row must be inside RowSettings")
  return settings
}
