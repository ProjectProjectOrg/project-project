import { createFileRoute } from "@tanstack/react-router"

import { AttachmentsSettings } from "@/features/attachments/components/AttachmentsSettings"
import { m } from "@/paraglide/messages"

export const Route = createFileRoute(
  "/_authed/orgs/$orgSlug/settings/integrations/storage/files"
)({
  component: AttachmentsSettings,
  loader: () => ({
    crumb: { type: "static" as const, label: m.attachments_crumb() }
  })
})
