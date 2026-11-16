import { createFileRoute } from "@tanstack/react-router"

import { settingsPage } from "@/components/shell/settings/SettingsLayout"
import { AttachmentsSettings } from "@/features/attachments/components/AttachmentsSettings"
import { m } from "@/paraglide/messages"

export const Route = createFileRoute(
  "/_authed/orgs/$orgSlug/settings/integrations/storage/files"
)({
  component: AttachmentsSettings,
  loader: () => settingsPage(m.attachments_crumb(), m.attachments_description())
})
