import { createFileRoute } from "@tanstack/react-router"

import { ProfileLayout } from "@/features/profile/components/ProfileLayout"
import { m } from "@/paraglide/messages"

export const Route = createFileRoute("/_authed/profile")({
  component: ProfileLayout,
  loader: () => ({
    crumb: {
      type: "static" as const,
      label: m.profile_crumb_label(),
      to: "/profile"
    }
  })
})
