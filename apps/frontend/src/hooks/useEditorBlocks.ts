import { useAtomValue } from "@effect/atom-react"
import { canCallOrg } from "@pp/shared"
import type { TicketType } from "@pp/shared"
import { useNavigate } from "@tanstack/react-router"
import * as AsyncResult from "effect/unstable/reactivity/AsyncResult"
import { useCallback, useMemo } from "react"

import type { EditorBlocks } from "@/components/Lexical/blocks/editorBlocks"
import {
  projectLibraryFor,
  projectLibraryRequest
} from "@/features/library/atoms/library"
import { orgDetail, orgRequest } from "@/features/organizations/atoms/orgs"

import { useMakeBlockDefinition } from "./useMakeBlockDefinition"

export function useEditorBlocks(
  orgSlug: string,
  slug: string,
  ticketType: TicketType | null,
  onMakeDefinitionError: (message: string) => void
): EditorBlocks | undefined {
  const navigate = useNavigate()
  const libraryResult = useAtomValue(
    projectLibraryFor(projectLibraryRequest(orgSlug, slug))
  )
  const orgResult = useAtomValue(orgDetail(orgRequest(orgSlug)))
  const library = AsyncResult.isSuccess(libraryResult)
    ? libraryResult.value
    : null
  const canEditOrg =
    AsyncResult.isSuccess(orgResult) &&
    canCallOrg(orgResult.value.role)("library", "createOrgBlock")
  const onMakeDefinition = useMakeBlockDefinition(
    orgSlug,
    slug,
    onMakeDefinitionError
  )
  const onEditDefinition = useCallback<EditorBlocks["onEditDefinition"]>(
    (_kind, key, origin) => {
      if (origin === "project")
        void navigate({
          to: "/orgs/$orgSlug/projects/$slug/settings/templates/blocks/$blockKey",
          params: { orgSlug, slug, blockKey: key }
        })
      else
        void navigate({
          to: "/orgs/$orgSlug/settings/templates/blocks/$blockKey",
          params: { orgSlug, blockKey: key }
        })
    },
    [navigate, orgSlug, slug]
  )
  return useMemo(
    () =>
      library === null
        ? undefined
        : {
            mode: "ticket",
            library,
            ticketType,
            canEdit: { org: canEditOrg, project: library.canEdit },
            onEditDefinition,
            onMakeDefinition
          },
    [library, ticketType, canEditOrg, onEditDefinition, onMakeDefinition]
  )
}
