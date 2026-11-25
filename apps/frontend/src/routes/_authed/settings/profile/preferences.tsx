import { createFileRoute } from "@tanstack/react-router"

import { settingsPage } from "@/components/shell/settings/settingsPage"
import { Preferences } from "@/features/profile/components/Preferences"
import { m } from "@/paraglide/messages"

export const Route = createFileRoute("/_authed/settings/profile/preferences")({
  component: Preferences,
  loader: () =>
    settingsPage(
      m.profile_section_preferences_title(),
      m.profile_section_preferences_description()
    )
})
