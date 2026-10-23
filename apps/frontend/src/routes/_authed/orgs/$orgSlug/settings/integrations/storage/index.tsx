import { createFileRoute } from "@tanstack/react-router"

import { StorageSettings } from "@/features/storage/components/StorageSettings"

export const Route = createFileRoute(
  "/_authed/orgs/$orgSlug/settings/integrations/storage/"
)({
  component: StorageSettings
})
