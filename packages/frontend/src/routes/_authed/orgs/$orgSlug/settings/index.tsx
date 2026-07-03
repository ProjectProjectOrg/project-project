import { Navigate, createFileRoute } from "@tanstack/react-router"

export const Route = createFileRoute("/_authed/orgs/$orgSlug/settings/")({
  component: SettingsIndex
})

function SettingsIndex() {
  const { orgSlug } = Route.useParams()
  return (
    <Navigate
      to="/orgs/$orgSlug/settings/general"
      params={{ orgSlug }}
      replace
    />
  )
}
