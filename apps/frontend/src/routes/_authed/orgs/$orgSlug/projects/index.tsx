import { createFileRoute } from "@tanstack/react-router"

import { Projects } from "@/features/projects/components/Projects"

export const Route = createFileRoute("/_authed/orgs/$orgSlug/projects/")({
  component: Projects,
  loader: ({ params }) => ({
    crumb: {
      type: "static" as const,
      label: "Projects",
      to: "/orgs/$orgSlug/projects",
      params: { orgSlug: params.orgSlug }
    }
  })
})
