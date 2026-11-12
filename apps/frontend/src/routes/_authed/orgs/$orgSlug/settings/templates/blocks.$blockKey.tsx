import { createFileRoute, redirect } from "@tanstack/react-router"

export const Route = createFileRoute(
  "/_authed/orgs/$orgSlug/settings/templates/blocks/$blockKey"
)({
  beforeLoad: ({ params: { blockKey, ...params } }) => {
    throw redirect({
      to: "/orgs/$orgSlug/settings/types/sections/$sectionKey",
      params: { ...params, sectionKey: blockKey },
      replace: true
    })
  }
})
