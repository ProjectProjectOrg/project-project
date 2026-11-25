import { createFileRoute } from "@tanstack/react-router"

import { Crumb } from "@/components/shell/crumb"
import { orgScope } from "@/features/library/atoms/libraryScope"
import { SectionPage } from "@/features/library/components/SectionPage"

export const Route = createFileRoute(
  "/_authed/settings/orgs/$orgSlug/types/sections/$sectionKey"
)({
  component: SectionSettings,
  loader: ({ params }) => ({
    crumb: Crumb.library({
      kind: "section",
      orgSlug: params.orgSlug,
      slug: null,
      entryKey: params.sectionKey
    })
  })
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
