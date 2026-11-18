import { createFileRoute } from "@tanstack/react-router"

import { Crumb } from "@/components/shell/Breadcrumbs"
import { ProjectImportStartPage } from "@/features/project-import/components/ProjectImportStartPage"
import { m } from "@/paraglide/messages"

export const Route = createFileRoute(
  "/_authed/orgs/$orgSlug/imports/projectproject/"
)({
  component: ProjectImportStartPage,
  loader: ({ params }) => ({
    crumb: Crumb.static({
      label: m.project_import_page_title(),
      to: "/orgs/$orgSlug/imports/projectproject",
      params: { orgSlug: params.orgSlug }
    })
  })
})
