import { createFileRoute, redirect } from "@tanstack/react-router"

export const Route = createFileRoute(
  "/_authed/orgs/$orgSlug/projects/$slug/settings/templates/$templateKey"
)({
  beforeLoad: ({ params: { templateKey, ...params } }) => {
    throw redirect({
      to: "/orgs/$orgSlug/projects/$slug/settings/types/$typeKey",
      params: { ...params, typeKey: templateKey },
      replace: true
    })
  }
})
