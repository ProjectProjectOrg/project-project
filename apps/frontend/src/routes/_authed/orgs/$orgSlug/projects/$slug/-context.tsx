import { useAtomValue } from "@effect/atom-react"
import type { ProjectDetail } from "@pp/shared"
import * as AsyncResult from "effect/unstable/reactivity/AsyncResult"
import { createContext, useContext } from "react"

import {
  project,
  type ProjectRequest
} from "@/features/projects/atoms/projects"

export const ProjectContext = createContext<ProjectRequest | null>(null)

export function useProjectRequest(): ProjectRequest {
  const req = useContext(ProjectContext)
  if (!req) throw new Error("useProjectRequest must be inside ProjectContext")
  return req
}

export function useProject(): ProjectDetail {
  const result = useAtomValue(project(useProjectRequest()))
  if (!AsyncResult.isSuccess(result)) {
    throw new Error("project is unavailable")
  }
  return result.value
}
