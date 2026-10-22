import { createFileRoute, redirect } from "@tanstack/react-router"

export const Route = createFileRoute("/_authed/orgs/$orgSlug/settings/email")({
  beforeLoad: ({ params }) => {
    throw redirect({
      to: "/orgs/$orgSlug/settings/integrations/email",
      params,
      replace: true
    })
  }
})
