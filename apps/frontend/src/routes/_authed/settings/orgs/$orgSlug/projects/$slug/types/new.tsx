import { createFileRoute } from "@tanstack/react-router"

import { Crumb } from "@/components/shell/Breadcrumbs"
import { projectScope } from "@/features/library/atoms/libraryScope"
import { NewEntryPage } from "@/features/library/components/NewEntryPage"
import { m } from "@/paraglide/messages"

export const Route = createFileRoute(
  "/_authed/settings/orgs/$orgSlug/projects/$slug/types/new"
)({
  component: NewTypeSettings,
  loader: () => ({
    crumb: Crumb.static({ label: m.templates_types_new_type() })
  })
})

function NewTypeSettings() {
  const params = Route.useParams()
  return (
    <NewEntryPage
      scope={projectScope(params.orgSlug, params.slug)}
      kind="type"
    />
  )
}
