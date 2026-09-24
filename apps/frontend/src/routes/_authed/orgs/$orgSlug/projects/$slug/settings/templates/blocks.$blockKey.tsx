import { createFileRoute } from "@tanstack/react-router"

import { BlockEditorPage } from "@/components/Library/BlockEditorPage"
import { projectScope } from "@/components/Library/libraryScope"

export const Route = createFileRoute(
  "/_authed/orgs/$orgSlug/projects/$slug/settings/templates/blocks/$blockKey"
)({
  component: ProjectBlockEditor
})

function ProjectBlockEditor() {
  const params = Route.useParams()
  return (
    <BlockEditorPage
      scope={projectScope(params.orgSlug, params.slug)}
      blockKey={params.blockKey}
    />
  )
}
