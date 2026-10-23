import { useAtomValue } from "@effect/atom-react"
import type { EstimationMode } from "@pp/shared"

import { projectEstimation } from "@/features/projects/atoms/projects"
import { useProjectRequest } from "@/features/projects/hooks/useProject"

export function useEstimationMode(): EstimationMode {
  return useAtomValue(projectEstimation(useProjectRequest()))
}
