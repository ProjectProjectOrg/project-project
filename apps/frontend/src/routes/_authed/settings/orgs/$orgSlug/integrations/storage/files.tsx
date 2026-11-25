import { createFileRoute } from "@tanstack/react-router"

import { settingsPage } from "@/components/shell/settings/settingsPage"
import { AttachmentsSettings } from "@/features/attachments/components/AttachmentsSettings"
import { m } from "@/paraglide/messages"

export const Route = createFileRoute(
  "/_authed/settings/orgs/$orgSlug/integrations/storage/files"
)({
  component: AttachmentsSettings,
  loader: () => settingsPage(m.attachments_crumb(), m.attachments_description())
})
