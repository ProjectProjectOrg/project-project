import { createFileRoute, redirect } from "@tanstack/react-router"

export const Route = createFileRoute(
  "/_authed/orgs/$orgSlug/settings/templates/$templateKey"
)({
  beforeLoad: ({ params: { templateKey, ...params } }) => {
    throw redirect({
      to: "/orgs/$orgSlug/settings/types/$typeKey",
      params: { ...params, typeKey: templateKey },
      replace: true
    })
  }
})
