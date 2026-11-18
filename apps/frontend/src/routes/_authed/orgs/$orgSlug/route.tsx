import { createFileRoute } from "@tanstack/react-router"

import { OrgLayout } from "@/features/organizations/components/OrgLayout"
import { loadOrg } from "@/features/organizations/lib/loadOrg"

export const Route = createFileRoute("/_authed/orgs/$orgSlug")({
  component: OrgRoute,
  loader: ({ context: { registry }, params, abortController }) =>
    loadOrg(registry, params.orgSlug, abortController.signal)
})

function OrgRoute() {
  const { orgSlug } = Route.useParams()
  return <OrgLayout orgSlug={orgSlug} />
}
