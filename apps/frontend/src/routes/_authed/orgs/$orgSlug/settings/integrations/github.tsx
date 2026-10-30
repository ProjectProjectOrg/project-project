import { createFileRoute } from "@tanstack/react-router"
import * as Schema from "effect/Schema"

import { GithubIntegrationPage } from "@/features/github/components/GithubIntegrationPage"
import { m } from "@/paraglide/messages"

const GithubIntegrationSearchSchema = Schema.Struct({
  installChoice: Schema.optional(Schema.String)
})

export const Route = createFileRoute(
  "/_authed/orgs/$orgSlug/settings/integrations/github"
)({
  component: GithubIntegrationPage,
  validateSearch: Schema.toStandardSchemaV1(GithubIntegrationSearchSchema),
  loader: () => ({
    crumb: {
      type: "static" as const,
      label: m.project_settings_github_heading()
    }
  })
})
