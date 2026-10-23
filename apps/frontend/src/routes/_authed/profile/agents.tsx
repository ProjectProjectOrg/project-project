import { createFileRoute } from "@tanstack/react-router"

import { ConnectedAgentsSection } from "@/components/ConnectedAgentsSection"
import { m } from "@/paraglide/messages"

export const Route = createFileRoute("/_authed/profile/agents")({
  component: ConnectedAgentsSection,
  loader: () => ({
    crumb: {
      type: "static" as const,
      label: m.profile_section_connected_agents_title()
    }
  })
})
