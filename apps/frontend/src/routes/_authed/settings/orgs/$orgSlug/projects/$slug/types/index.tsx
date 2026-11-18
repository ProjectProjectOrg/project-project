import { createFileRoute } from "@tanstack/react-router"

import { projectScope } from "@/features/library/atoms/libraryScope"
import { TicketTypesPage } from "@/features/library/components/TicketTypesPage"
import { m } from "@/paraglide/messages"

export const Route = createFileRoute(
  "/_authed/settings/orgs/$orgSlug/projects/$slug/types/"
)({
  component: TypesSettings,
  loader: () => ({
    page: {
      heading: m.project_settings_types_tab(),
      description: m.project_settings_types_description()
    }
  })
})

function TypesSettings() {
  const params = Route.useParams()
  const navigate = Route.useNavigate()
  return (
    <TicketTypesPage
      scope={projectScope(params.orgSlug, params.slug)}
      tab="types"
      onTabChange={(next) => {
        if (next !== "types")
          void navigate({
            to: "/settings/orgs/$orgSlug/projects/$slug/types/sections",
            params,
            replace: true
          })
      }}
    />
  )
}
