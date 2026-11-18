import { createFileRoute } from "@tanstack/react-router"

import { Crumb } from "@/components/shell/Breadcrumbs"
import { SettingsLayout } from "@/components/shell/settings/SettingsLayout"
import { m } from "@/paraglide/messages"

export const Route = createFileRoute("/_authed/orgs/$orgSlug/settings")({
  component: SettingsLayout,
  loader: () => ({
    crumb: Crumb.static({ label: m.org_settings_crumb() })
  })
})
