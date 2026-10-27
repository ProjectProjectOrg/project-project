import { createFileRoute } from "@tanstack/react-router"

import { orgScope } from "@/features/library/atoms/libraryScope"
import { BlockEditorPage } from "@/features/library/components/BlockEditorPage"

export const Route = createFileRoute(
  "/_authed/orgs/$orgSlug/settings/templates/blocks/$blockKey"
)({
  component: OrgBlockEditor
})

function OrgBlockEditor() {
  const params = Route.useParams()
  return (
    <BlockEditorPage
      scope={orgScope(params.orgSlug)}
      blockKey={params.blockKey}
    />
  )
}
