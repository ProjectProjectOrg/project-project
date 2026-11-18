import { createFileRoute } from "@tanstack/react-router"

import { Crumb } from "@/components/shell/Breadcrumbs"
import { SettingsLayout } from "@/components/shell/settings/SettingsLayout"
import { m } from "@/paraglide/messages"

export const Route = createFileRoute(
  "/_authed/orgs/$orgSlug/projects/$slug/settings"
)({
  component: SettingsLayout,
  loader: () => ({
    crumb: Crumb.static({ label: m.project_detail_tab_settings() })
  })
})
