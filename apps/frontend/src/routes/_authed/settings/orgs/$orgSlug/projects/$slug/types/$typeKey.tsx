import { createFileRoute } from "@tanstack/react-router"

import { Crumb } from "@/components/shell/Breadcrumbs"
import { projectScope } from "@/features/library/atoms/libraryScope"
import { TypePage } from "@/features/library/components/TypePage"

export const Route = createFileRoute(
  "/_authed/settings/orgs/$orgSlug/projects/$slug/types/$typeKey"
)({
  component: TicketTypeSettings,
  loader: ({ params }) => ({
    crumb: Crumb.library({
      kind: "type",
      orgSlug: params.orgSlug,
      slug: params.slug,
      entryKey: params.typeKey
    })
  })
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
