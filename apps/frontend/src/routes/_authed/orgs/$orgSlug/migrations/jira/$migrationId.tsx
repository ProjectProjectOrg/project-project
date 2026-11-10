import { createFileRoute } from "@tanstack/react-router"
import * as Schema from "effect/Schema"

import { JiraImportPage } from "@/features/jira/components/JiraImportPage"
import { JiraImportSearch } from "@/features/jira/lib/search"
import { m } from "@/paraglide/messages"

export const Route = createFileRoute(
  "/_authed/orgs/$orgSlug/migrations/jira/$migrationId"
)({
  component: JiraImportRoute,
  validateSearch: Schema.toStandardSchemaV1(JiraImportSearch),
  loader: ({ params }) => ({
    crumb: {
      type: "static" as const,
      label: m.jira_import_list_title(),
      to: "/orgs/$orgSlug/migrations/jira",
      params: { orgSlug: params.orgSlug }
    }
  })
})

function JiraImportRoute() {
  const { orgSlug, migrationId } = Route.useParams()
  return <JiraImportPage orgSlug={orgSlug} migrationId={migrationId} />
}
