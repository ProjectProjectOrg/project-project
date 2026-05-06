import { createFileRoute, redirect } from "@tanstack/react-router"

export const Route = createFileRoute("/_authed/")({
  beforeLoad: () => {
    throw redirect({
      to: "/orgs/$orgSlug",
      params: { orgSlug: "project-project" }
    })
  }
})
