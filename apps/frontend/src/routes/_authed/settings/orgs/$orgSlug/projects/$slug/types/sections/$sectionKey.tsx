import { createFileRoute } from "@tanstack/react-router"

import { Crumb } from "@/components/shell/Breadcrumbs"
import { projectScope } from "@/features/library/atoms/libraryScope"
import { SectionPage } from "@/features/library/components/SectionPage"

export const Route = createFileRoute(
  "/_authed/settings/orgs/$orgSlug/projects/$slug/types/sections/$sectionKey"
)({
  component: SectionSettings,
  loader: ({ params }) => ({
    crumb: Crumb.library({
      kind: "section",
      orgSlug: params.orgSlug,
      slug: params.slug,
      entryKey: params.sectionKey
    })
  })
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
