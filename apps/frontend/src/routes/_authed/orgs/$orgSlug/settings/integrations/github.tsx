import { useAtomSet, useAtomValue } from "@effect/atom-react"
import type { GithubOrgIntegrationStatus } from "@pp/shared"
import { createFileRoute } from "@tanstack/react-router"
import * as Match from "effect/Match"
import * as Result from "effect/unstable/reactivity/AsyncResult"
import { ExternalLink } from "lucide-react"

import { ErrorPage } from "@/components/ErrorPage"
import {
  IntegrationDetail,
  IntegrationStatus
} from "@/components/settings/IntegrationDetail"
import { useGithubAppState } from "@/components/settings/orgIntegrations"
import {
  SettingsGroup,
  SettingsRow,
  SettingsSection
} from "@/components/settings/SettingsSection"
import { Button } from "@/components/ui/button"
import {
  githubIntegration,
  githubOrgRequest,
  startGithubInstall
} from "@/features/github/atoms/github"
import { useOrgActor } from "@/lib/access"
import { cn } from "@/lib/utils"
import { m } from "@/paraglide/messages"
import { getLocale } from "@/paraglide/runtime"

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

const installationsUrl = (status: GithubOrgIntegrationStatus) =>
  status.accountType === "Organization" && status.accountLogin
    ? `https://github.com/organizations/${status.accountLogin}/settings/installations`
    : "https://github.com/settings/installations"

function GithubIntegrationPage() {
  const { orgSlug } = Route.useParams()
  const canInstall = useOrgActor(orgSlug).call("projects", "startGithubInstall")
  const req = githubOrgRequest(orgSlug)
  const integration = useAtomValue(githubIntegration(req))
  const startInstall = useAtomSet(startGithubInstall(req), { mode: "promise" })
  const installState = useAtomValue(startGithubInstall(req))
  const state = useGithubAppState(orgSlug)
  const status = Result.isSuccess(integration) ? integration.value : null
  const installError = installState.waiting
    ? null
    : Result.matchWithError(installState, {
        onInitial: () => null,
        onSuccess: () => null,
        onError: (error) =>
          Match.value(error).pipe(
            Match.tag("Forbidden", () =>
              m.github_chip_install_app_forbidden_error()
            ),
            Match.orElse(() => m.github_chip_install_app_failed_error())
          ),
        onDefect: () => m.github_chip_install_app_failed_error()
      })

  async function install() {
    if (installState.waiting) return
    try {
      const { installUrl } = await startInstall({ returnProjectSlug: null })
      window.location.assign(installUrl)
    } catch {
      return
    }
  }

  const actions =
    status?.status === "active" ? (
      <Button
        variant="tertiary"
        size="sm"
        trailingIcon={ExternalLink}
        render={
          <a href={installationsUrl(status)} target="_blank" rel="noreferrer" />
        }
      >
        {m.org_integrations_manage_on_github_button()}
      </Button>
    ) : canInstall && status ? (
      <Button
        type="button"
        size="sm"
        onClick={() => void install()}
        className={cn(installState.waiting && "animate-pulse")}
      >
        {status.status === "broken"
          ? m.org_integrations_reinstall_button()
          : m.org_integrations_install_button()}
      </Button>
    ) : null

  return (
    <IntegrationDetail
      orgSlug={orgSlug}
      kind="github"
      name={m.project_settings_github_heading()}
      description={m.org_integrations_github_card()}
      about={m.org_integrations_github_about()}
      actions={actions}
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
      <GithubAccount integration={integration} installError={installError} />
    </IntegrationDetail>
  )
}

function GithubAccount({
  integration,
  installError
}: Readonly<{
  integration: Result.AsyncResult<GithubOrgIntegrationStatus, unknown>
  installError: string | null
}>) {
  return Result.matchWithError(integration, {
    onInitial: () => null,
    onError: (error) => <ErrorPage error={error} contained />,
    onDefect: (defect) => <ErrorPage error={defect} contained />,
    onSuccess: ({ value: status }) =>
      status.status !== "not_connected" ? (
        <SettingsSection>
          <SettingsGroup>
            <SettingsRow
              label={m.org_integrations_github_account_label()}
              error={installError ?? status.lastCheckError}
            >
              <span className="text-[13px] text-muted-foreground">
                {status.accountLogin ?? "—"}
              </span>
            </SettingsRow>
            <SettingsRow label={m.org_integrations_github_account_type_label()}>
              <span className="text-[13px] text-muted-foreground">
                {status.accountType === "Organization"
                  ? m.org_integrations_github_account_type_org()
                  : m.org_integrations_github_account_type_user()}
              </span>
            </SettingsRow>
            {status.lastCheckedAt ? (
              <SettingsRow
                label={m.org_integrations_github_last_checked_label()}
              >
                <span className="text-[13px] text-muted-foreground">
                  {status.lastCheckedAt.toLocaleDateString(getLocale())}
                </span>
              </SettingsRow>
            ) : null}
          </SettingsGroup>
        </SettingsSection>
      ) : installError ? (
        <p role="alert" className="text-xs text-destructive">
          {installError}
        </p>
      ) : null
  })
}
