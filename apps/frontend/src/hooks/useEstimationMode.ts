import { useAtomValue } from "@effect/atom-react"
import type { EstimationMode } from "@pp/shared"

import { projectEstimation } from "@/features/projects/atoms/projects"
import { useProjectRequest } from "@/routes/_authed/orgs/$orgSlug/projects/$slug/-context"

export function useEstimationMode(): EstimationMode {
  return useAtomValue(projectEstimation(useProjectRequest()))
}
