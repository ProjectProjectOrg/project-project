import { createFileRoute } from "@tanstack/react-router"

import { orgScope } from "@/features/library/atoms/libraryScope"
import { TemplateEditorPage } from "@/features/library/components/TemplateEditorPage"

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
