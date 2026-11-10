import { createFileRoute } from "@tanstack/react-router"

import { JiraImportsPage } from "@/features/jira/components/JiraImportsPage"
import { m } from "@/paraglide/messages"

export const Route = createFileRoute("/_authed/orgs/$orgSlug/migrations/jira/")(
  {
    component: JiraImportsRoute,
    loader: ({ params }) => ({
      crumb: {
        type: "static" as const,
        label: m.jira_import_list_title(),
        to: "/orgs/$orgSlug/migrations/jira",
        params: { orgSlug: params.orgSlug }
      }
    })
  }
)

function JiraImportsRoute() {
  const { orgSlug } = Route.useParams()
  return <JiraImportsPage orgSlug={orgSlug} />
}
