import { useAtomValue } from "@effect/atom-react"
import * as AsyncResult from "effect/unstable/reactivity/AsyncResult"
import { createContext, useContext } from "react"
import type { ProjectDetail } from "@projectproject/shared"
import { project, type ProjectRequest } from "@/atoms/projects"

export const ProjectContext = createContext<ProjectRequest | null>(null)

const requireProjectRequest = (req: ProjectRequest | null): ProjectRequest => {
  if (!req) throw new Error("useProject must be inside ProjectContext")
  return req
}

export function useProject(): ProjectDetail {
  const req = requireProjectRequest(useContext(ProjectContext))
  const result = useAtomValue(project(req))
  if (!AsyncResult.isSuccess(result)) {
    throw new Error("project is unavailable")
  }
  return result.value
}
