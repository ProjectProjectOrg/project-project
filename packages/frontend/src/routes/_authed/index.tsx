import { createFileRoute, redirect } from "@tanstack/react-router"

export const Route = createFileRoute("/_authed/")({
  // T-08 will replace this hardcoded redirect with the real "list user's orgs" call.
  beforeLoad: () => {
    throw redirect({
      to: "/orgs/$orgSlug/projects",
      params: { orgSlug: "project-project" }
    })
  }
})
