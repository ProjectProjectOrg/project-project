import { createFileRoute } from "@tanstack/react-router"

import { LibraryPage } from "@/components/Library/LibraryPage"
import { projectScope } from "@/components/Library/libraryScope"
import { m } from "@/paraglide/messages"

export const Route = createFileRoute(
  "/_authed/orgs/$orgSlug/projects/$slug/settings/templates/"
)({
  component: ProjectTemplatesSettings,
  loader: () => ({
    crumb: {
      type: "static" as const,
      label: m.project_settings_templates_tab()
    }
  })
})

function ProjectTemplatesSettings() {
  const { orgSlug, slug } = Route.useParams()
  return <LibraryPage scope={projectScope(orgSlug, slug)} />
}
