import { useAtomValue } from "@effect/atom-react"
import type { TypeKey } from "@pp/shared"
import { useNavigate } from "@tanstack/react-router"
import * as AsyncResult from "effect/reactivity/AsyncResult"

import { BUILTIN_LIBRARY } from "@/features/editor/lib/blockChrome"
import {
  projectLibraryFor,
  projectLibraryRequest
} from "@/features/library/atoms/library"
import { projectScope } from "@/features/library/atoms/libraryScope"
import { useLibraryPermissions } from "@/features/library/hooks/useLibraryPermissions"

export function useTypeEditing(orgSlug: string, slug: string) {
  const result = useAtomValue(
    projectLibraryFor(projectLibraryRequest(orgSlug, slug))
  )
  const library = AsyncResult.isSuccess(result) ? result.value : BUILTIN_LIBRARY
  const canEdit = useLibraryPermissions(
    projectScope(orgSlug, slug),
    library
  ).project
  const navigate = useNavigate()
  return {
    canEdit,
    openTypes: () =>
      void navigate({
        to: "/orgs/$orgSlug/projects/$slug/settings/types",
        params: { orgSlug, slug }
      }),
    openType: (typeKey: TypeKey) =>
      void navigate({
        to: "/orgs/$orgSlug/projects/$slug/settings/types/$typeKey",
        params: { orgSlug, slug, typeKey }
      })
  }
}
