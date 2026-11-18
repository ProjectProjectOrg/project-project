import { createFileRoute, Outlet } from "@tanstack/react-router"

import { Crumb } from "@/components/shell/Breadcrumbs"
import { figmaProfileAtom } from "@/features/figma/atoms/figma"
import {
  oauthApplicationsAtom,
  oauthApplicationsRequest
} from "@/features/oauth/atoms/oauthApplications"
import { slackProfiles } from "@/features/slack/atoms/slack"
import { m } from "@/paraglide/messages"

export const Route = createFileRoute("/_authed/settings/profile")({
  component: Outlet,
  loader: ({ context: { registry } }) => {
    registry.mount(figmaProfileAtom)()
    registry.mount(slackProfiles({}))()
    registry.mount(oauthApplicationsAtom(oauthApplicationsRequest()))()
    return {
      crumb: Crumb.static({ label: m.profile_crumb_label(), role: "scope" })
    }
  }
})
