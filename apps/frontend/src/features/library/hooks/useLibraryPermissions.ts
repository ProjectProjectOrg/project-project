import { useAtomValue } from "@effect/atom-react"
import type { Library } from "@pp/shared"
import * as AsyncResult from "effect/reactivity/AsyncResult"
import * as Atom from "effect/reactivity/Atom"
import { useMemo } from "react"

import { orgDetail, orgRequest } from "@/features/organizations/atoms/orgs"
import { project, projectRequest } from "@/features/projects/atoms/projects"
import { useOrgActor } from "@/hooks/useActor"

import type { LibraryScope } from "../atoms/libraryScope"
import type { LibraryPermissions } from "../lib/entryStanding"

export function useLibraryPermissions(
  scope: LibraryScope,
  library: Library
): LibraryPermissions {
  const orgAdmin = useOrgActor(scope.req.params.orgSlug).call(
    "library",
    "updateOrgType"
  )
  return useMemo(
    () =>
      scope.layer === "org"
        ? { org: library.canEdit, project: false }
        : { org: orgAdmin, project: library.canEdit },
    [library.canEdit, orgAdmin, scope.layer]
  )
}

export function useOrgName(orgSlug: string): string {
  const detail = useAtomValue(orgDetail(orgRequest(orgSlug)))
  return AsyncResult.isSuccess(detail) ? detail.value.name : orgSlug
}

const noProject = Atom.make(null)

export function useScopeProject(scope: LibraryScope) {
  const result = useAtomValue(
    scope.layer === "project"
      ? project(projectRequest(scope.req.params.orgSlug, scope.req.params.slug))
      : noProject
  )
  return result !== null && AsyncResult.isSuccess(result) ? result.value : null
}

export function useScopeProjectName(scope: LibraryScope): string {
  const detail = useScopeProject(scope)
  if (scope.layer === "org") return ""
  return detail?.name ?? scope.req.params.slug
}
