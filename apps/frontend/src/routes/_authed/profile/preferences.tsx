import { createFileRoute } from "@tanstack/react-router"

import { Preferences } from "@/features/profile/components/Preferences"
import { m } from "@/paraglide/messages"

export const Route = createFileRoute("/_authed/profile/preferences")({
  component: Preferences,
  loader: () => ({
    crumb: {
      type: "static" as const,
      label: m.profile_section_preferences_title()
    }
  })
})
