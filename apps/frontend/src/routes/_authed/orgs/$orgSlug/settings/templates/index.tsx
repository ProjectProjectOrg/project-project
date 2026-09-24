import { createFileRoute } from "@tanstack/react-router"

import { LibraryPage } from "@/components/Library/LibraryPage"
import { orgScope } from "@/components/Library/libraryScope"
import { m } from "@/paraglide/messages"

export const Route = createFileRoute(
  "/_authed/orgs/$orgSlug/settings/templates/"
)({
  component: OrgTemplatesSettings,
  loader: () => ({
    crumb: { type: "static" as const, label: m.org_settings_templates_tab() }
  })
})

function OrgTemplatesSettings() {
  const { orgSlug } = Route.useParams()
  return <LibraryPage scope={orgScope(orgSlug)} />
}
