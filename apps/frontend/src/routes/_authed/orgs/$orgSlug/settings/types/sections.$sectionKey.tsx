import { createFileRoute } from "@tanstack/react-router"

import { orgScope } from "@/features/library/atoms/libraryScope"
import { SectionPage } from "@/features/library/components/SectionPage"

export const Route = createFileRoute(
  "/_authed/orgs/$orgSlug/settings/types/sections/$sectionKey"
)({
  component: SectionSettings
})

function SectionSettings() {
  const params = Route.useParams()
  return (
    <SectionPage
      scope={orgScope(params.orgSlug)}
      sectionKey={params.sectionKey}
    />
  )
}
