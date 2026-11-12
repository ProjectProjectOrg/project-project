import { createFileRoute } from "@tanstack/react-router"

import { projectScope } from "@/features/library/atoms/libraryScope"
import { TypeEditorPage } from "@/features/library/components/TypeEditorPage"

export const Route = createFileRoute(
  "/_authed/orgs/$orgSlug/projects/$slug/settings/templates/$templateKey"
)({
  component: ProjectTemplateEditor
})

function ProjectTemplateEditor() {
  const params = Route.useParams()
  return (
    <TypeEditorPage
      scope={projectScope(params.orgSlug, params.slug)}
      templateKey={params.templateKey}
    />
  )
}
