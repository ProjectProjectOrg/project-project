import { Navigate, createFileRoute } from "@tanstack/react-router"

export const Route = createFileRoute(
  "/_authed/orgs/$orgSlug/projects/$slug/settings/"
)({
  component: SettingsIndex
})

function SettingsIndex() {
  const { orgSlug, slug } = Route.useParams()
  return (
    <Navigate
      to="/orgs/$orgSlug/projects/$slug/settings/general"
      params={{ orgSlug, slug }}
      replace
    />
  )
}
