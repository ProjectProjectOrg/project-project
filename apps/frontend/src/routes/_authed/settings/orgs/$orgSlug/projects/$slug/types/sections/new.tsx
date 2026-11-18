import { createFileRoute } from "@tanstack/react-router"

import { Crumb } from "@/components/shell/Breadcrumbs"
import { projectScope } from "@/features/library/atoms/libraryScope"
import { NewEntryPage } from "@/features/library/components/NewEntryPage"
import { m } from "@/paraglide/messages"

export const Route = createFileRoute(
  "/_authed/settings/orgs/$orgSlug/projects/$slug/types/sections/new"
)({
  component: NewSectionSettings,
  loader: () => ({
    crumb: Crumb.static({ label: m.templates_types_new_section() })
  })
})

function NewSectionSettings() {
  const params = Route.useParams()
  return (
    <NewEntryPage
      scope={projectScope(params.orgSlug, params.slug)}
      kind="section"
    />
  )
}
