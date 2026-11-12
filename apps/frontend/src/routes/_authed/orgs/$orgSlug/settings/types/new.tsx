import { createFileRoute } from "@tanstack/react-router"

import { orgScope } from "@/features/library/atoms/libraryScope"
import { NewEntryPage } from "@/features/library/components/NewEntryPage"

export const Route = createFileRoute(
  "/_authed/orgs/$orgSlug/settings/types/new"
)({
  component: NewTypeSettings
})

function NewTypeSettings() {
  const params = Route.useParams()
  return <NewEntryPage scope={orgScope(params.orgSlug)} kind="type" />
}
