import { createFileRoute } from "@tanstack/react-router"

import { GithubIntegrationPage } from "@/features/github/components/GithubIntegrationPage"
import { m } from "@/paraglide/messages"

export const Route = createFileRoute(
  "/_authed/orgs/$orgSlug/settings/integrations/github"
)({
  component: GithubIntegrationPage,
  loader: () => ({
    crumb: {
      type: "static" as const,
      label: m.project_settings_github_heading()
    }
  })
})
