import { createFileRoute, redirect } from "@tanstack/react-router"

export const Route = createFileRoute("/_authed/orgs/$orgSlug/settings/danger")({
  beforeLoad: ({ params }) => {
    throw redirect({
      to: "/orgs/$orgSlug/settings/general",
      params,
      replace: true
    })
  }
})
