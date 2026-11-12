import { createFileRoute } from "@tanstack/react-router"

import { orgScope } from "@/features/library/atoms/libraryScope"
import { TypeEditorPage } from "@/features/library/components/TypeEditorPage"

export const Route = createFileRoute(
  "/_authed/orgs/$orgSlug/settings/templates/$templateKey"
)({
  component: OrgTemplateEditor
})

function OrgTemplateEditor() {
  const params = Route.useParams()
  return (
    <TypeEditorPage
      scope={orgScope(params.orgSlug)}
      templateKey={params.templateKey}
    />
  )
}
