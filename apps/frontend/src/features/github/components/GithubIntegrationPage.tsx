import { useAtomRefresh, useAtomValue } from "@effect/atom-react"
import { getRouteApi } from "@tanstack/react-router"

import { AsyncView } from "@/components/shell/AsyncView"
import {
  githubIntegration,
  githubOrgRequest
} from "@/features/github/atoms/github"
import { GithubApps } from "@/features/github/components/GithubApps"
import { InstallationChoices } from "@/features/github/components/InstallationChoices"
import {
  IntegrationDetail,
  IntegrationStatus
} from "@/features/integrations/components/IntegrationDetail"
import { useGithubAppState } from "@/features/integrations/hooks/useOrgIntegrations"
import { m } from "@/paraglide/messages"

const routeApi = getRouteApi(
  "/_authed/orgs/$orgSlug/settings/integrations/github"
)

export function GithubIntegrationPage() {
  const { orgSlug } = routeApi.useParams()
  const { installChoice } = routeApi.useSearch()
  const req = githubOrgRequest(orgSlug)
  const integration = useAtomValue(githubIntegration(req))
  const refresh = useAtomRefresh(githubIntegration(req))
  const state = useGithubAppState(orgSlug)

  return (
    <IntegrationDetail
      orgSlug={orgSlug}
      kind="github"
      name={m.project_settings_github_heading()}
      description={m.org_integrations_github_card()}
      about={m.org_integrations_github_about()}
      meta={[
        {
          label: m.org_integrations_meta_status(),
          value: <IntegrationStatus tone={state.tone} label={state.label} />
        },
        {
          label: m.org_integrations_meta_category(),
          value: m.org_integrations_category_development()
        },
        {
          label: m.org_integrations_meta_scope(),
          value: m.org_integrations_scope_org()
        }
      ]}
    >
      {installChoice ? (
        <InstallationChoices orgSlug={orgSlug} state={installChoice} />
      ) : null}
      <AsyncView
        result={integration}
        reset={refresh}
        contained
        onInitial={() => null}
        onSuccess={({ value }) => (
          <GithubApps orgSlug={orgSlug} status={value} />
        )}
      />
    </IntegrationDetail>
  )
}
