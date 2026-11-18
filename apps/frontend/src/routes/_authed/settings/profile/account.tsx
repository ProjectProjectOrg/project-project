import { createFileRoute } from "@tanstack/react-router"

import { settingsPage } from "@/components/shell/settings/SettingsLayout"
import { Account } from "@/features/profile/components/Account"
import { m } from "@/paraglide/messages"

export const Route = createFileRoute("/_authed/settings/profile/account")({
  component: Account,
  loader: () =>
    settingsPage(
      m.profile_section_account_title(),
      m.profile_section_account_description()
    )
})
