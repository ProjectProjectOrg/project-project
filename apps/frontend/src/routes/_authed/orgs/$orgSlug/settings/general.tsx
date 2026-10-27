import { createFileRoute } from "@tanstack/react-router"

import { OrgGeneralSettings } from "@/features/organizations/components/settings/OrgGeneralSettings"
import { m } from "@/paraglide/messages"

export const Route = createFileRoute("/_authed/orgs/$orgSlug/settings/general")(
  {
    component: OrgGeneralSettings,
    loader: () => ({
      crumb: { type: "static" as const, label: m.org_settings_general_tab() }
    })
  }
)
