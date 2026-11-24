import { createFileRoute } from "@tanstack/react-router"

import { Crumb } from "@/components/shell/crumb"
import { orgScope } from "@/features/library/atoms/libraryScope"
import { TypePage } from "@/features/library/components/TypePage"

export const Route = createFileRoute(
  "/_authed/settings/orgs/$orgSlug/types/$typeKey"
)({
  component: TicketTypeSettings,
  loader: ({ params }) => ({
    crumb: Crumb.library({
      kind: "type",
      orgSlug: params.orgSlug,
      slug: null,
      entryKey: params.typeKey
    })
  })
})

function TicketTypeSettings() {
  const params = Route.useParams()
  return <TypePage scope={orgScope(params.orgSlug)} typeKey={params.typeKey} />
}
