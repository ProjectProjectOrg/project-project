import { useAtomValue } from "@effect/atom-react"
import type { Library } from "@pp/shared"
import * as AsyncResult from "effect/reactivity/AsyncResult"
import { useMemo } from "react"

import { orgDetail, orgRequest } from "@/features/organizations/atoms/orgs"
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
