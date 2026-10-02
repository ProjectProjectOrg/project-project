import { useAtomValue } from "@effect/atom-react"

import { orgActor, orgRequest } from "@/features/organizations/atoms/orgs"
import { projectActor } from "@/features/projects/atoms/projects"
import { useProjectRequest } from "@/routes/_authed/orgs/$orgSlug/projects/$slug/-context"

export function useProjectActor() {
  return useAtomValue(projectActor(useProjectRequest()))
}

export function useOrgActor(orgSlug: string) {
  return useAtomValue(orgActor(orgRequest(orgSlug)))
}
