import { createFileRoute } from "@tanstack/react-router"
import * as Effect from "effect/Effect"
import * as Registry from "effect/reactivity/AtomRegistry"

import { settingsPage } from "@/components/shell/settings/settingsPage"
import {
  oauthApplicationsAtom,
  oauthApplicationsRequest
} from "@/features/oauth/atoms/oauthApplications"
import { ConnectedAgentsSection } from "@/features/oauth/components/ConnectedAgentsSection"
import { m } from "@/paraglide/messages"

export const Route = createFileRoute("/_authed/settings/profile/agents")({
  component: ConnectedAgentsSection,
  loader: async ({ context: { registry }, abortController }) => {
    await Effect.runPromiseExit(
      Registry.getResult(
        registry,
        oauthApplicationsAtom(oauthApplicationsRequest())
      ),
      { signal: abortController.signal }
    )
    return settingsPage(
      m.profile_section_connected_agents_title(),
      m.profile_section_connected_agents_description()
    )
  }
})
