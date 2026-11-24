import { createFileRoute } from "@tanstack/react-router"

import { Crumb } from "@/components/shell/crumb"
import { orgScope } from "@/features/library/atoms/libraryScope"
import { NewEntryPage } from "@/features/library/components/NewEntryPage"
import { m } from "@/paraglide/messages"

export const Route = createFileRoute(
  "/_authed/settings/orgs/$orgSlug/types/sections/new"
)({
  component: NewSectionSettings,
  loader: () => ({
    crumb: Crumb.static({ label: m.templates_types_new_section() })
  })
})

function NewSectionSettings() {
  const params = Route.useParams()
  return <NewEntryPage scope={orgScope(params.orgSlug)} kind="section" />
}
