import { createFileRoute, redirect } from "@tanstack/react-router"

export const Route = createFileRoute("/_authed/settings/orgs/$orgSlug/")({
  beforeLoad: ({ params }) => {
    throw redirect({
      to: "/settings/orgs/$orgSlug/general",
      params,
      replace: true
    })
  }
})
