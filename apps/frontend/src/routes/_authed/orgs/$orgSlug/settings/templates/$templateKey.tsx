import { createFileRoute } from "@tanstack/react-router"

import { orgScope } from "@/components/Library/libraryScope"
import { TemplateEditorPage } from "@/components/Library/TemplateEditorPage"

export const Route = createFileRoute(
  "/_authed/orgs/$orgSlug/settings/templates/$templateKey"
)({
  component: OrgTemplateEditor
})

function OrgTemplateEditor() {
  const params = Route.useParams()
  return (
    <TemplateEditorPage
      scope={orgScope(params.orgSlug)}
      templateKey={params.templateKey}
    />
  )
}
