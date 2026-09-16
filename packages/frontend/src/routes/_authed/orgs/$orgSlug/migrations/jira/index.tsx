import { createFileRoute } from "@tanstack/react-router"
import { JiraMigrationStartPage } from "@/JiraMigration/JiraMigrationPage"
import { m } from "@/paraglide/messages"

export const Route = createFileRoute("/_authed/orgs/$orgSlug/migrations/jira/")(
  {
    component: JiraMigrationStartRoute,
    loader: ({ params }) => ({
      crumb: {
        type: "static" as const,
        label: m.jira_migration_page_title(),
        to: "/orgs/$orgSlug/migrations/jira",
        params: { orgSlug: params.orgSlug }
      }
    })
  }
)

function JiraMigrationStartRoute() {
  const { orgSlug } = Route.useParams()
  return <JiraMigrationStartPage orgSlug={orgSlug} />
}
