import { createFileRoute } from "@tanstack/react-router"

import { orgScope } from "@/features/library/atoms/libraryScope"
import { TicketTypesPage } from "@/features/library/components/TicketTypesPage"
import { m } from "@/paraglide/messages"

export const Route = createFileRoute("/_authed/settings/orgs/$orgSlug/types/")({
  component: TypesSettings,
  loader: () => ({
    page: {
      heading: m.org_settings_types_tab(),
      description: m.org_settings_types_description()
    }
  })
})

function TypesSettings() {
  const params = Route.useParams()
  const navigate = Route.useNavigate()
  return (
    <TicketTypesPage
      scope={orgScope(params.orgSlug)}
      tab="types"
      onTabChange={(next) => {
        if (next !== "types")
          void navigate({
            to: "/settings/orgs/$orgSlug/types/sections",
            params,
            replace: true
          })
      }}
    />
  )
}
