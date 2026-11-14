import { createFileRoute, redirect } from "@tanstack/react-router"

export const Route = createFileRoute(
  "/_authed/orgs/$orgSlug/projects/$slug/settings/"
)({
  beforeLoad: ({ params }) => {
    throw redirect({
      to: "/orgs/$orgSlug/projects/$slug/settings/general",
      params,
      replace: true
    })
  }
})
