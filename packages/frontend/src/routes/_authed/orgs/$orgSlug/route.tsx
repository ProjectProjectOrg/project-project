import { createFileRoute, Outlet } from "@tanstack/react-router"
import { useEffect } from "react"
import { authClient } from "@/services/AuthClient"

export const Route = createFileRoute("/_authed/orgs/$orgSlug")({
  component: OrgLayout
})

function OrgLayout() {
  const { orgSlug } = Route.useParams()

  useEffect(() => {
    void authClient.organization.setActive({ organizationSlug: orgSlug })
  }, [orgSlug])

  return <Outlet />
}
