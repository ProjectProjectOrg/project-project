import { createFileRoute } from "@tanstack/react-router"

import { projectScope } from "@/features/library/atoms/libraryScope"
import { NewEntryPage } from "@/features/library/components/NewEntryPage"

export const Route = createFileRoute(
  "/_authed/orgs/$orgSlug/projects/$slug/settings/types/new"
)({
  component: NewTypeSettings
})

function NewTypeSettings() {
  const params = Route.useParams()
  return (
    <NewEntryPage
      scope={projectScope(params.orgSlug, params.slug)}
      kind="type"
    />
  )
}
