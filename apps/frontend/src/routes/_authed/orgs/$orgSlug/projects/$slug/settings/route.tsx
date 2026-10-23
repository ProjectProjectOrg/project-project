import { createFileRoute } from "@tanstack/react-router"

import { ProjectSettingsLayout } from "@/features/projects/components/settings/ProjectSettingsLayout"
import { m } from "@/paraglide/messages"

export const Route = createFileRoute(
  "/_authed/orgs/$orgSlug/projects/$slug/settings"
)({
  component: ProjectSettingsLayout,
  loader: () => ({
    crumb: { type: "static" as const, label: m.project_detail_tab_settings() }
  })
})
