import { createFileRoute } from "@tanstack/react-router"

import { projectScope } from "@/features/library/atoms/libraryScope"
import { BlockEditorPage } from "@/features/library/components/BlockEditorPage"

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
