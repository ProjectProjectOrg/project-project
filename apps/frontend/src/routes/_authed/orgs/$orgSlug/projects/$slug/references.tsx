import { createFileRoute } from "@tanstack/react-router"

import { Crumb } from "@/components/shell/Breadcrumbs"
import { ReferencesPage } from "@/features/project-references/components/ReferencesPage"
import { m } from "@/paraglide/messages"

export const Route = createFileRoute(
  "/_authed/orgs/$orgSlug/projects/$slug/references"
)({
  component: ReferencesPage,
  loader: () => ({
    crumb: Crumb.static({ label: m.project_references_title() })
  })
})
