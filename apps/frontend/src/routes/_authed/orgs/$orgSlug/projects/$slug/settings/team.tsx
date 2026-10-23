import { createFileRoute } from "@tanstack/react-router"

import { TeamSettings } from "@/features/members/components/TeamSettings"
import { m } from "@/paraglide/messages"

export const Route = createFileRoute(
  "/_authed/orgs/$orgSlug/projects/$slug/settings/team"
)({
  component: TeamSettings,
  loader: () => ({
    crumb: { type: "static" as const, label: m.project_settings_team_tab() }
  })
})
