import { createFileRoute } from "@tanstack/react-router"

import { orgScope } from "@/features/library/atoms/libraryScope"
import { TypePage } from "@/features/library/components/TypePage"

export const Route = createFileRoute(
  "/_authed/orgs/$orgSlug/settings/types/$typeKey"
)({
  component: TicketTypeSettings
})

function TicketTypeSettings() {
  const params = Route.useParams()
  return <TypePage scope={orgScope(params.orgSlug)} typeKey={params.typeKey} />
}
