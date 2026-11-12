import { createFileRoute } from "@tanstack/react-router"

import { orgScope } from "@/features/library/atoms/libraryScope"
import { NewEntryPage } from "@/features/library/components/NewEntryPage"

export const Route = createFileRoute(
  "/_authed/orgs/$orgSlug/settings/types/sections/new"
)({
  component: NewSectionSettings
})

function NewSectionSettings() {
  const params = Route.useParams()
  return <NewEntryPage scope={orgScope(params.orgSlug)} kind="section" />
}
