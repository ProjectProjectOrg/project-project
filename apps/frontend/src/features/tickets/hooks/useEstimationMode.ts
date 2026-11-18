import { useAtomValue } from "@effect/atom-react"

import { projectEstimation } from "@/features/projects/atoms/projects"
import { useProjectRequest } from "@/features/projects/hooks/useProject"

export function useEstimationMode() {
  return useAtomValue(projectEstimation(useProjectRequest()))
}
