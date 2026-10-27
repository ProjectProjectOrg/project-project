import { createFileRoute } from "@tanstack/react-router"

import { InvitePage } from "@/features/organizations/components/InvitePage"

export const Route = createFileRoute("/invite/$invitationId")({
  component: InvitePage
})
