import { createFileRoute } from "@tanstack/react-router"

import { Crumb } from "@/components/shell/Breadcrumbs"
import { ProjectImportPage } from "@/features/project-import/components/ProjectImportPage"
import { m } from "@/paraglide/messages"

export const Route = createFileRoute(
  "/_authed/orgs/$orgSlug/imports/projectproject/$importId"
)({
  component: ProjectImportPage,
  loader: ({ params }) => ({
    crumb: Crumb.static({
      label: m.project_import_page_title(),
      to: "/orgs/$orgSlug/imports/projectproject/$importId",
      params: { orgSlug: params.orgSlug, importId: params.importId }
    })
  })
})
