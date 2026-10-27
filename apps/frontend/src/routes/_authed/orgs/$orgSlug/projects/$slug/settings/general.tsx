import { createFileRoute } from "@tanstack/react-router"

import { ProjectGeneralSettings } from "@/features/projects/components/settings/ProjectGeneralSettings"
import { m } from "@/paraglide/messages"

export const Route = createFileRoute(
  "/_authed/orgs/$orgSlug/projects/$slug/settings/general"
)({
  component: ProjectGeneralSettings,
  loader: () => ({
    crumb: { type: "static" as const, label: m.project_settings_general_tab() }
  })
})
