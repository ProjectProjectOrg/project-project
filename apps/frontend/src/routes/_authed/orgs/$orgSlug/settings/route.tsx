import { createFileRoute } from "@tanstack/react-router"

import { SettingsLayout } from "@/components/shell/settings/SettingsLayout"
import { m } from "@/paraglide/messages"

export const Route = createFileRoute("/_authed/orgs/$orgSlug/settings")({
  component: SettingsLayout,
  loader: () => ({
    crumb: { type: "static" as const, label: m.org_settings_crumb() }
  })
})
