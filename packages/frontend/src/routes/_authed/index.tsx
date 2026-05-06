import { createFileRoute } from "@tanstack/react-router"

// Required so TanStack Router registers "/"; reached only when activeOrgSlug is null
export const Route = createFileRoute("/_authed/")({
  component: () => null
})
