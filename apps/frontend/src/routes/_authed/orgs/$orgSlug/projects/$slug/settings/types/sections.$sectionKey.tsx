import { createFileRoute } from "@tanstack/react-router"

import { projectScope } from "@/features/library/atoms/libraryScope"
import { SectionPage } from "@/features/library/components/SectionPage"

export const Route = createFileRoute(
  "/_authed/orgs/$orgSlug/projects/$slug/settings/types/sections/$sectionKey"
)({
  component: SectionSettings
})

function SectionSettings() {
  const params = Route.useParams()
  return (
    <SectionPage
      scope={projectScope(params.orgSlug, params.slug)}
      sectionKey={params.sectionKey}
    />
  )
}
