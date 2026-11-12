import { createFileRoute } from "@tanstack/react-router"

import { projectScope } from "@/features/library/atoms/libraryScope"
import { TypePage } from "@/features/library/components/TypePage"

export const Route = createFileRoute(
  "/_authed/orgs/$orgSlug/projects/$slug/settings/types/$typeKey"
)({
  component: TicketTypeSettings
})

function TicketTypeSettings() {
  const params = Route.useParams()
  return (
    <TypePage
      scope={projectScope(params.orgSlug, params.slug)}
      typeKey={params.typeKey}
    />
  )
}
