import { useAtomValue } from "@effect/atom-react"
import { createFileRoute, Link } from "@tanstack/react-router"
import * as Result from "effect/reactivity/AsyncResult"

import { ErrorPage } from "@/components/shell/ErrorPage"
import {
  SettingsGroup,
  SettingsRow,
  SettingsSection
} from "@/components/shell/settings/SettingsSection"
import { SettingsSkeleton } from "@/components/shell/settings/SettingsSkeleton"
import { Button } from "@/components/ui/button"
import {
  IntegrationDetail,
  IntegrationStatus
} from "@/features/integrations/components/IntegrationDetail"
import { IntegrationProjects } from "@/features/integrations/components/IntegrationProjects"
import { useSlackState } from "@/features/integrations/hooks/useOrgIntegrations"
import {
  slackOrg,
  slackOrgRequest,
  slackProfiles
} from "@/features/slack/atoms/slack"
import { SlackAppSetup } from "@/features/slack/components/AppSetup"
import { SlackConnectionForm } from "@/features/slack/forms/slack-connection"
import { useSlackOrgPolling } from "@/features/slack/hooks/useSlackOrgPolling"
import { useOrgActor } from "@/lib/access"
import { m } from "@/paraglide/messages"

export const Route = createFileRoute(
  "/_authed/orgs/$orgSlug/settings/integrations/slack"
)({
  component: SlackIntegrationPage,
  loader: () => ({
    crumb: { type: "static" as const, label: m.slack_heading() }
  })
})

function SlackIntegrationPage() {
  const { orgSlug } = Route.useParams()
  const canManage = useOrgActor(orgSlug).call("slack", "orgStatus")
  const state = useSlackState(orgSlug)
  useSlackOrgPolling(orgSlug, canManage)

  return (
    <IntegrationDetail
      orgSlug={orgSlug}
      kind="slack"
      name={m.slack_heading()}
      description={m.org_integrations_slack_card()}
      about={m.org_integrations_slack_about()}
      meta={[
        {
          label: m.org_integrations_meta_status(),
          value: <IntegrationStatus tone={state.tone} label={state.label} />
        },
        {
          label: m.org_integrations_meta_category(),
          value: m.org_integrations_category_communication()
        },
        {
          label: m.org_integrations_meta_scope(),
          value: m.org_integrations_scope_org()
        }
      ]}
    >
      {canManage ? <SlackContent orgSlug={orgSlug} /> : <ErrorPage contained />}
    </IntegrationDetail>
  )
}

function SlackContent({ orgSlug }: Readonly<{ orgSlug: string }>) {
  const result = useAtomValue(slackOrg(slackOrgRequest(orgSlug)))
  return Result.matchWithError(result, {
    onInitial: () => <SettingsSkeleton />,
    onError: (error) => <ErrorPage contained error={error} />,
    onDefect: (defect) => <ErrorPage contained error={defect} />,
    onSuccess: ({ value }) => (
      <>
        <SlackConnectionForm orgSlug={orgSlug} status={value} />
        {value.connection ? (
          <>
            <SettingsSection>
              <SettingsGroup>
                <PersonalAccountRow orgSlug={orgSlug} />
              </SettingsGroup>
            </SettingsSection>
            <IntegrationProjects orgSlug={orgSlug} />
            <SettingsSection title={m.slack_app_configuration()}>
              <SlackAppSetup orgSlug={orgSlug} includeCreate={false} />
            </SettingsSection>
          </>
        ) : null}
      </>
    )
  })
}

function PersonalAccountRow({ orgSlug }: Readonly<{ orgSlug: string }>) {
  const profiles = useAtomValue(slackProfiles({}))
  return Result.matchWithError(profiles, {
    onInitial: () => (
      <SettingsRow
        label={m.slack_personal_label()}
        description={
          <span className="block h-3 w-40 animate-pulse rounded bg-muted" />
        }
      />
    ),
    onError: (error) => <ErrorPage contained error={error} />,
    onDefect: (defect) => <ErrorPage contained error={defect} />,
    onSuccess: ({ value }) => (
      <SettingsRow
        label={m.slack_personal_label()}
        description={
          value.some(
            (profile) => profile.orgSlug === orgSlug && profile.slackUserId
          )
            ? m.org_integrations_personal_connected()
            : m.org_integrations_personal_not_connected()
        }
      >
        <Button
          variant="tertiary"
          size="sm"
          render={<Link to="/profile/connections" />}
        >
          {m.org_integrations_personal_button()}
        </Button>
      </SettingsRow>
    )
  })
}
