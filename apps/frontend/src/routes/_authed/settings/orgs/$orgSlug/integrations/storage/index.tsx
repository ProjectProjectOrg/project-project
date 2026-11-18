import { createFileRoute } from "@tanstack/react-router"

import { StorageSettings } from "@/features/storage/components/StorageSettings"

export const Route = createFileRoute(
  "/_authed/settings/orgs/$orgSlug/integrations/storage/"
)({
  component: StorageSettings
})
