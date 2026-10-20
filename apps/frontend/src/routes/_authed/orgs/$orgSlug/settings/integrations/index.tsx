import { createFileRoute, type LinkProps } from "@tanstack/react-router"

import {
  IntegrationCard,
  IntegrationGrid
} from "@/components/settings/IntegrationDetail"
import type { IntegrationKind } from "@/components/settings/IntegrationLogo"
import {
  perProjectState,
  useEmailState,
  useGithubAppState,
  useStorageState,
  type IntegrationState
} from "@/components/settings/orgIntegrations"
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
  const canManageEmail = useOrgActor(orgSlug).call("orgEmail", "get")
  const github = useGithubAppState(orgSlug)
  const storage = useStorageState(orgSlug)
  const email = useEmailState(orgSlug)

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
  if (github.loading || storage.loading || (canManageEmail && email.loading))
    return (
      <IntegrationGrid
        title={m.org_integrations_connected_section()}
        description={m.org_integrations_connected_description()}
      >
        {entries.map((entry) => (
          <div
            key={entry.kind}
            className="h-[15rem] animate-pulse rounded-[14px] bg-surface-3 shadow-surface-1"
          />
        ))}
      </IntegrationGrid>
    )
  const connected = entries.filter((entry) => entry.state.connected)
  const available = entries.filter((entry) => !entry.state.connected)

  return (
    <>
      {connected.length > 0 ? (
        <IntegrationGrid
          title={m.org_integrations_connected_section()}
          description={m.org_integrations_connected_description()}
        >
          {connected.map((entry) => (
            <Card key={entry.kind} orgSlug={orgSlug} entry={entry} />
          ))}
        </IntegrationGrid>
      ) : null}
      {available.length > 0 ? (
        <IntegrationGrid
          title={m.org_integrations_available_section()}
          description={m.org_integrations_available_description()}
        >
          {available.map((entry) => (
            <Card key={entry.kind} orgSlug={orgSlug} entry={entry} />
          ))}
        </IntegrationGrid>
      ) : null}
    </>
  )
}

function Card({ orgSlug, entry }: Readonly<{ orgSlug: string; entry: Entry }>) {
  return (
    <IntegrationCard
      kind={entry.kind}
      name={entry.name}
      description={entry.description}
      tone={entry.state.tone}
      action={
        entry.state.connected
          ? m.org_integrations_manage_button()
          : entry.kind === "everhour" || entry.kind === "figma"
            ? m.org_integrations_view_button()
            : m.org_integrations_set_up_button()
      }
      status={
        entry.state.loading
          ? null
          : entry.state.tone === "connected"
            ? m.org_integrations_status_connected()
            : entry.state.label
      }
      to={entry.to}
      params={{ orgSlug }}
    />
  )
}
