import { createFileRoute } from "@tanstack/react-router"

import { projectScope } from "@/features/library/atoms/libraryScope"
import { TicketTypesPage } from "@/features/library/components/TicketTypesPage"
import { m } from "@/paraglide/messages"

export const Route = createFileRoute(
  "/_authed/settings/orgs/$orgSlug/projects/$slug/types/sections/"
)({
  component: SectionsSettings,
  loader: () => ({
    page: {
      heading: m.project_settings_types_tab(),
      description: m.project_settings_types_description()
    }
  })
})

function SectionsSettings() {
  const params = Route.useParams()
  const navigate = Route.useNavigate()
  return (
    <TicketTypesPage
      scope={projectScope(params.orgSlug, params.slug)}
      tab="sections"
      onTabChange={(next) => {
        if (next !== "sections")
          void navigate({
            to: "/settings/orgs/$orgSlug/projects/$slug/types",
            params,
            replace: true
          })
      }}
    />
  )
}
