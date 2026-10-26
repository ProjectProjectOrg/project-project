import { useAtomValue } from "@effect/atom-react"
import type { ProjectDetail } from "@pp/shared"
import * as AsyncResult from "effect/reactivity/AsyncResult"
import { createContext, useContext } from "react"

import {
  project,
  type ProjectRequest
} from "@/features/projects/atoms/projects"
import {
  statusesRequest,
  type StatusesRequest
} from "@/features/projects/atoms/projectStatuses"
import {
  sprintListRequest,
  type SprintListRequest
} from "@/features/sprints/atoms/sprintList"

export const ProjectContext = createContext<ProjectRequest | null>(null)

export function useProjectRequest(): ProjectRequest {
  const req = useContext(ProjectContext)
  if (!req) throw new Error("useProjectRequest must be inside ProjectContext")
  return req
}

export type ProjectRoute = Readonly<{
  orgSlug: string
  slug: string
  projectReq: ProjectRequest
  statusesReq: StatusesRequest
  sprintListReq: SprintListRequest
}>

export function useProjectRoute(): ProjectRoute {
  const projectReq = useProjectRequest()
  const { orgSlug, slug } = projectReq.params
  return {
    orgSlug,
    slug,
    projectReq,
    statusesReq: statusesRequest(orgSlug, slug),
    sprintListReq: sprintListRequest(orgSlug, slug)
  }
}

export function useProject(): ProjectDetail {
  const result = useAtomValue(project(useProjectRequest()))
  if (!AsyncResult.isSuccess(result)) {
    throw new Error("project is unavailable")
  }
  return result.value
}
