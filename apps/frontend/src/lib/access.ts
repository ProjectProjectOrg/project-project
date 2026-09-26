import { useAtomValue } from "@effect/atom-react"
import type { ProjectActor } from "@pp/access/policies"
import { Project } from "@pp/access/roles"
import { canCallProject } from "@pp/shared"
import * as Result from "effect/unstable/reactivity/AsyncResult"

import { me } from "@/features/auth/atoms/auth"
import { useProject } from "@/routes/_authed/orgs/$orgSlug/projects/$slug/-context"

export function useProjectCan() {
  return canCallProject(useProject().permissions)
}

export function useProjectActor(): ProjectActor {
  const { permissions } = useProject()
  const viewer = useAtomValue(me())
  return {
    userId: Result.isSuccess(viewer) ? viewer.value.id : "",
    permissions: Project.projectStatement.role(permissions)
  }
}
