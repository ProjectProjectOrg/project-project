import { createFileRoute, type LinkProps } from "@tanstack/react-router"

import {
  INTEGRATION_GRID_CLASS,
  IntegrationCard,
  IntegrationCardSkeleton,
  type IntegrationTone
} from "@/components/settings/IntegrationDetail"
import type { IntegrationKind } from "@/components/settings/IntegrationLogo"
import {
  perProjectState,
  useEmailState,
  useGithubAppState,
  useSlackState,
  useStorageState,
  type IntegrationState
} from "@/components/settings/orgIntegrations"
import { useSlackOrgPolling } from "@/features/slack/hooks/useSlackOrgPolling"
import { useOrgActor } from "@/lib/access"
import { m } from "@/paraglide/messages"

export const Route = createFileRoute(
  "/_authed/orgs/$orgSlug/settings/integrations/"
)({
  component: OrgIntegrations
})

type Entry = Readonly<{
  kind: IntegrationKind
  name: string
  description: string
  state: IntegrationState
  to: LinkProps["to"]
}>

function OrgIntegrations() {
  const { orgSlug } = Route.useParams()
  const actor = useOrgActor(orgSlug)
  const canManageEmail = actor.call("orgEmail", "get")
  const canManageSlack = actor.call("slack", "orgStatus")
  const github = useGithubAppState(orgSlug)
  const storage = useStorageState(orgSlug)
  const email = useEmailState(orgSlug)
  const slack = useSlackState(orgSlug)
  useSlackOrgPolling(orgSlug, canManageSlack)

  const entries: ReadonlyArray<Entry> = [
    {
      kind: "github",
      name: m.project_settings_github_heading(),
      description: m.org_integrations_github_card(),
      state: github,
      to: "/orgs/$orgSlug/settings/integrations/github"
    },
    {
      kind: "storage",
      name: m.storage_heading(),
      description: m.org_integrations_storage_card(),
      state: storage,
      to: "/orgs/$orgSlug/settings/integrations/storage"
    },
    ...(canManageEmail
      ? [
          {
            kind: "email",
            name: m.org_email_heading(),
            description: m.org_integrations_email_card(),
            state: email,
            to: "/orgs/$orgSlug/settings/integrations/email"
          } satisfies Entry
        ]
      : []),
    ...(canManageSlack
      ? [
          {
            kind: "slack",
            name: m.slack_heading(),
            description: m.org_integrations_slack_card(),
            state: slack,
            to: "/orgs/$orgSlug/settings/integrations/slack"
          } satisfies Entry
        ]
      : []),
    {
      kind: "everhour",
      name: m.project_settings_everhour_heading(),
      description: m.org_integrations_everhour_card(),
      state: perProjectState(false, storage),
      to: "/orgs/$orgSlug/settings/integrations/everhour"
    },
    {
      kind: "figma",
      name: m.figma_project_title(),
      description: m.org_integrations_figma_card(),
      state: perProjectState(true, storage),
      to: "/orgs/$orgSlug/settings/integrations/figma"
    }
  ]
  if (
    github.loading ||
    storage.loading ||
    (canManageEmail && email.loading) ||
    (canManageSlack && slack.loading)
  )
    return (
      <div className={INTEGRATION_GRID_CLASS}>
        {entries.map((entry) => (
          <IntegrationCardSkeleton key={entry.kind} />
        ))}
      </div>
    )

  return (
    <div className={INTEGRATION_GRID_CLASS}>
      {entries.toSorted(byTone).map((entry) => (
        <IntegrationCard
          key={entry.kind}
          kind={entry.kind}
          name={entry.name}
          description={entry.description}
          tone={entry.state.tone}
          status={entry.state.label}
          to={entry.to}
          params={{ orgSlug }}
        />
      ))}
    </div>
  )
}

const TONE_ORDER: Readonly<Record<IntegrationTone, number>> = {
  connected: 0,
  attention: 1,
  idle: 2
}

const byTone = (a: Entry, b: Entry) =>
  TONE_ORDER[a.state.tone] - TONE_ORDER[b.state.tone]
