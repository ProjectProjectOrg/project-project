import { createFileRoute } from "@tanstack/react-router"

import { OrgDangerSettings } from "@/features/organizations/components/settings/OrgDangerSettings"
import { m } from "@/paraglide/messages"

export const Route = createFileRoute("/_authed/orgs/$orgSlug/settings/danger")({
  component: OrgDangerSettings,
  loader: () => ({
    crumb: { type: "static" as const, label: m.org_settings_danger_tab() }
  })
})
