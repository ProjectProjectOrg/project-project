import { createFileRoute, Outlet } from "@tanstack/react-router"

export const Route = createFileRoute("/_authed/orgs/$orgSlug")({
  component: OrgLayout,
  loader: ({ params }) => ({
    crumb: { type: "org" as const, orgSlug: params.orgSlug }
  })
})

function OrgLayout() {
  return <Outlet />
}
