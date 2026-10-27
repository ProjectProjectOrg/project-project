import { createFileRoute } from "@tanstack/react-router"

import { OrgSettingsLayout } from "@/features/organizations/components/settings/OrgSettingsLayout"
import { m } from "@/paraglide/messages"

export const Route = createFileRoute("/_authed/orgs/$orgSlug/settings")({
  component: OrgSettingsLayout,
  loader: () => ({
    crumb: { type: "static" as const, label: m.org_settings_crumb() }
  })
})
