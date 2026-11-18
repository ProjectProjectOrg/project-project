import { createFileRoute } from "@tanstack/react-router"

import { orgScope } from "@/features/library/atoms/libraryScope"
import { TicketTypesPage } from "@/features/library/components/TicketTypesPage"
import { m } from "@/paraglide/messages"

export const Route = createFileRoute(
  "/_authed/settings/orgs/$orgSlug/types/sections/"
)({
  component: SectionsSettings,
  loader: () => ({
    page: {
      heading: m.org_settings_types_tab(),
      description: m.org_settings_types_description()
    }
  })
})

function SectionsSettings() {
  const params = Route.useParams()
  const navigate = Route.useNavigate()
  return (
    <TicketTypesPage
      scope={orgScope(params.orgSlug)}
      tab="sections"
      onTabChange={(next) => {
        if (next !== "sections")
          void navigate({
            to: "/settings/orgs/$orgSlug/types",
            params,
            replace: true
          })
      }}
    />
  )
}
