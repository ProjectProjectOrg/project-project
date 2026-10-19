import { Navigate, createFileRoute } from "@tanstack/react-router"

export const Route = createFileRoute("/_authed/orgs/$orgSlug/settings/slack")({
  component: SlackSettingsRedirect
})

function SlackSettingsRedirect() {
  const { orgSlug } = Route.useParams()
  return (
    <Navigate
      to="/orgs/$orgSlug/settings/integrations"
      params={{ orgSlug }}
      replace
    />
  )
}
