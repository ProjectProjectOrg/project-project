import { createFileRoute } from "@tanstack/react-router"

import { Crumb } from "@/components/shell/Breadcrumbs"
import { OrgLayout } from "@/features/organizations/components/OrgLayout"
import { loadOrg } from "@/features/organizations/lib/loadOrg"

export const Route = createFileRoute("/_authed/settings/orgs/$orgSlug")({
  component: OrgSettingsRoute,
  loader: async ({ context: { registry }, params, abortController }) => {
    await loadOrg(registry, params.orgSlug, abortController.signal)
    return { crumb: Crumb.org({ orgSlug: params.orgSlug }) }
  }
})

function OrgSettingsRoute() {
  const { orgSlug } = Route.useParams()
  return <OrgLayout orgSlug={orgSlug} />
}
