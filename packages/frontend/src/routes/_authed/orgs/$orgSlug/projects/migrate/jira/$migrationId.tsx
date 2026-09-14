import { createFileRoute } from "@tanstack/react-router"
import { JiraMigrationPendingPage } from "@/JiraMigration/JiraMigrationPage"
import { m } from "@/paraglide/messages"

export const Route = createFileRoute(
  "/_authed/orgs/$orgSlug/projects/migrate/jira/$migrationId"
)({
  component: JiraMigrationItemRoute,
  loader: ({ params }) => ({
    crumb: {
      type: "static" as const,
      label: m.jira_migration_page_title(),
      to: "/orgs/$orgSlug/projects/migrate/jira/$migrationId",
      params: {
        orgSlug: params.orgSlug,
        migrationId: params.migrationId
      }
    }
  })
})

function JiraMigrationItemRoute() {
  const { orgSlug, migrationId } = Route.useParams()
  return (
    <JiraMigrationPendingPage orgSlug={orgSlug} migrationId={migrationId} />
  )
}
