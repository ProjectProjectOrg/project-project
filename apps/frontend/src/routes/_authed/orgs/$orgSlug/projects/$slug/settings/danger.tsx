import { createFileRoute } from "@tanstack/react-router"

import { ProjectDangerSettings } from "@/features/projects/components/settings/ProjectDangerSettings"
import { m } from "@/paraglide/messages"

export const Route = createFileRoute(
  "/_authed/orgs/$orgSlug/projects/$slug/settings/danger"
)({
  component: ProjectDangerSettings,
  loader: () => ({
    crumb: { type: "static" as const, label: m.project_settings_danger_tab() }
  })
})
