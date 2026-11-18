import { createFileRoute, redirect } from "@tanstack/react-router"

export const Route = createFileRoute(
  "/_authed/settings/orgs/$orgSlug/projects/$slug/"
)({
  beforeLoad: ({ params }) => {
    throw redirect({
      to: "/settings/orgs/$orgSlug/projects/$slug/general",
      params,
      replace: true
    })
  }
})
