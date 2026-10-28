import { createFileRoute } from "@tanstack/react-router"

import { figmaProfileAtom } from "@/features/figma/atoms/figma"
import {
  oauthApplicationsAtom,
  oauthApplicationsRequest
} from "@/features/oauth/atoms/oauthApplications"
import { ProfileLayout } from "@/features/profile/components/ProfileLayout"
import { slackProfiles } from "@/features/slack/atoms/slack"
import { m } from "@/paraglide/messages"

export const Route = createFileRoute("/_authed/profile")({
  component: ProfileLayout,
  loader: ({ context: { registry } }) => {
    registry.mount(figmaProfileAtom)()
    registry.mount(slackProfiles({}))()
    registry.mount(oauthApplicationsAtom(oauthApplicationsRequest()))()
    return {
      crumb: {
        type: "static" as const,
        label: m.profile_crumb_label(),
        to: "/profile"
      }
    }
  }
})
