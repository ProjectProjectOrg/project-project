import { createFileRoute } from "@tanstack/react-router"

import { ProjectImportStartPage } from "@/features/project-import/components/ProjectImportStartPage"
import { m } from "@/paraglide/messages"

export const Route = createFileRoute(
  "/_authed/orgs/$orgSlug/imports/projectproject/"
)({
  component: ProjectImportStartPage,
  loader: ({ params }) => ({
    crumb: {
      type: "static" as const,
      label: m.project_import_page_title(),
      to: "/orgs/$orgSlug/imports/projectproject",
      params: { orgSlug: params.orgSlug }
    }
  })
})
