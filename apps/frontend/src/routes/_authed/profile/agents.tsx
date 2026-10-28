import { createFileRoute } from "@tanstack/react-router"
import * as Effect from "effect/Effect"
import * as Registry from "effect/reactivity/AtomRegistry"

import {
  oauthApplicationsAtom,
  oauthApplicationsRequest
} from "@/features/oauth/atoms/oauthApplications"
import { ConnectedAgentsSection } from "@/features/oauth/components/ConnectedAgentsSection"
import { m } from "@/paraglide/messages"

export const Route = createFileRoute("/_authed/profile/agents")({
  component: ConnectedAgentsSection,
  loader: async ({ context: { registry }, abortController }) => {
    await Effect.runPromiseExit(
      Registry.getResult(
        registry,
        oauthApplicationsAtom(oauthApplicationsRequest())
      ),
      { signal: abortController.signal }
    )
    return {
      crumb: {
        type: "static" as const,
        label: m.profile_section_connected_agents_title()
      }
    }
  }
})
