import { useAtomValue } from "@effect/atom-react"
import type { Library } from "@pp/shared"
import * as AsyncResult from "effect/reactivity/AsyncResult"
import type { ReactNode } from "react"

import { AsyncView } from "@/components/shell/AsyncView"
import { LibraryContext } from "@/features/editor/lib/blockChrome"
import { LibraryCreateForm } from "@/features/library/forms/library-create"
import { m } from "@/paraglide/messages"

import { orgLibraryFor, orgLibraryRequest } from "../atoms/library"
import { libraryView, type LibraryScope } from "../atoms/libraryScope"
import {
  useLibraryPermissions,
  useOrgName
} from "../hooks/useLibraryPermissions"
import { creatableLayers } from "../lib/entryStanding"
import type { LibraryKind } from "../lib/libraryModel"
import { LibraryEditorSkeleton, LibraryEntryFrame } from "./LibraryEditorChrome"
import { noticeText } from "./ScopeBox"

type NewEntryPageProps = Readonly<{ scope: LibraryScope; kind: LibraryKind }>

export function NewEntryPage({ scope, kind }: NewEntryPageProps) {
  const result = useAtomValue(libraryView(scope))
  return (
    <LibraryEntryFrame scope={scope} kind={kind}>
      <h2 className="text-display font-bold">
        {kind === "type"
          ? m.templates_new_type_title()
          : m.templates_new_section_title()}
      </h2>
      <AsyncView
        result={result}
        contained
        onInitial={() => <LibraryEditorSkeleton />}
        onSuccess={({ value }) => (
          <LibraryContext value={value}>
            <NewEntryBody scope={scope} kind={kind} library={value} />
          </LibraryContext>
        )}
      />
    </LibraryEntryFrame>
  )
}

function NewEntryBody({
  scope,
  kind,
  library
}: NewEntryPageProps & Readonly<{ library: Library }>) {
  const permissions = useLibraryPermissions(scope, library)
  const orgName = useOrgName(scope.req.params.orgSlug)
  const layers = creatableLayers(scope.layer, permissions)
  if (layers.length === 0)
    return (
      <p className="text-body text-muted-foreground">
        {noticeText(
          scope.layer === "org" ? "org-admins" : "project-managers",
          kind
        )}
      </p>
    )
  const form = (orgLibrary: Library | null) => (
    <LibraryCreateForm
      kind={kind}
      scope={scope}
      library={library}
      orgLibrary={orgLibrary}
      layers={layers}
      orgName={orgName}
    />
  )
  return scope.layer === "project" && layers.includes("org") ? (
    <WithOrgLibrary orgSlug={scope.req.params.orgSlug} render={form} />
  ) : (
    form(scope.layer === "org" ? library : null)
  )
}

function WithOrgLibrary({
  orgSlug,
  render
}: Readonly<{
  orgSlug: string
  render: (orgLibrary: Library | null) => ReactNode
}>) {
  const result = useAtomValue(orgLibraryFor(orgLibraryRequest(orgSlug)))
  return render(AsyncResult.isSuccess(result) ? result.value : null)
}
