import { createFileRoute } from "@tanstack/react-router"

import { Crumb } from "@/components/shell/crumb"
import { SettingsLayout } from "@/components/shell/settings/SettingsLayout"
import { m } from "@/paraglide/messages"

export const Route = createFileRoute("/_authed/settings")({
  component: SettingsLayout,
  loader: () => ({
    crumb: Crumb.static({ label: m.nav_settings_crumb() })
  })
})
