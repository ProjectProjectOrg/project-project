import type * as Registry from "effect/reactivity/AtomRegistry"

import {
  everhourProjectRequest,
  everhourProjectStatusAtom
} from "@/features/everhour/atoms/everhour"
import {
  projectLibraryFor,
  projectLibraryRequest
} from "@/features/library/atoms/library"
import { project, projectRequest } from "@/features/projects/atoms/projects"
import {
  statusesFor,
  statusesRequest
} from "@/features/projects/atoms/projectStatuses"
import {
  sprintList,
  sprintListRequest
} from "@/features/sprints/atoms/sprintList"

// Starts loading what every page of a project reads.
export function mountProject(
  registry: Registry.AtomRegistry,
  orgSlug: string,
  slug: string
) {
  registry.mount(project(projectRequest(orgSlug, slug)))()
  registry.mount(sprintList(sprintListRequest(orgSlug, slug)))()
  registry.mount(statusesFor(statusesRequest(orgSlug, slug)))()
  registry.mount(projectLibraryFor(projectLibraryRequest(orgSlug, slug)))()
  registry.mount(
    everhourProjectStatusAtom(everhourProjectRequest(orgSlug, slug))
  )()
}
