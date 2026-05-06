import { createFileRoute, Outlet } from "@tanstack/react-router"

export const Route = createFileRoute("/_authed/orgs/$orgSlug")({
  component: OrgLayout
})

function OrgLayout() {
  return <Outlet />
}
