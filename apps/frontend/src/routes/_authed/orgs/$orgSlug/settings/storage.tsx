import { createFileRoute, redirect } from "@tanstack/react-router"

export const Route = createFileRoute("/_authed/orgs/$orgSlug/settings/storage")(
  {
    beforeLoad: ({ params }) => {
      throw redirect({
        to: "/orgs/$orgSlug/settings/integrations/storage",
        params,
        replace: true
      })
    }
  }
)
