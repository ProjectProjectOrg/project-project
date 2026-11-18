import { createFileRoute } from "@tanstack/react-router"

import { Crumb } from "@/components/shell/Breadcrumbs"
import { JiraImportNewPage } from "@/features/jira/components/JiraImportNewPage"
import { m } from "@/paraglide/messages"

export const Route = createFileRoute(
  "/_authed/orgs/$orgSlug/migrations/jira/new"
)({
  component: JiraImportNewRoute,
  loader: ({ params }) => ({
    crumb: Crumb.static({
      label: m.jira_import_list_title(),
      to: "/orgs/$orgSlug/migrations/jira",
      params: { orgSlug: params.orgSlug }
    })
  })
})

function JiraImportNewRoute() {
  const { orgSlug } = Route.useParams()
  return <JiraImportNewPage orgSlug={orgSlug} />
}
