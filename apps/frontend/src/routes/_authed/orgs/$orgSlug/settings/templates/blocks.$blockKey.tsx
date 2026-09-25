import { createFileRoute } from "@tanstack/react-router"

import { BlockEditorPage } from "@/components/Library/BlockEditorPage"
import { orgScope } from "@/components/Library/libraryScope"

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
