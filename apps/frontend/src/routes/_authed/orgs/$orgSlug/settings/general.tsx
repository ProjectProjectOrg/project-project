import { createFileRoute } from "@tanstack/react-router"

import { settingsPage } from "@/components/shell/settings/SettingsLayout"
import { OrgGeneralSettings } from "@/features/organizations/components/settings/OrgGeneralSettings"
import { m } from "@/paraglide/messages"

export const Route = createFileRoute("/_authed/orgs/$orgSlug/settings/general")(
  {
    component: OrgGeneralSettings,
    loader: () =>
      settingsPage(
        m.org_settings_general_tab(),
        m.org_settings_general_description()
      )
  }
)
