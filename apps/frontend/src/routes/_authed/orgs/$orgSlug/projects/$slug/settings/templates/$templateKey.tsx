import { createFileRoute } from "@tanstack/react-router"

import { projectScope } from "@/components/Library/libraryScope"
import { TemplateEditorPage } from "@/components/Library/TemplateEditorPage"

export const Route = createFileRoute(
  "/_authed/orgs/$orgSlug/projects/$slug/settings/templates/$templateKey"
)({
  component: ProjectTemplateEditor
})

function ProjectTemplateEditor() {
  const params = Route.useParams()
  return (
    <TemplateEditorPage
      scope={projectScope(params.orgSlug, params.slug)}
      templateKey={params.templateKey}
    />
  )
}
