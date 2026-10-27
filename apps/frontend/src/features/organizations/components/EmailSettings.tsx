import { useAtomValue } from "@effect/atom-react"
import { getRouteApi } from "@tanstack/react-router"

import { AsyncView } from "@/components/shell/AsyncView"
import { SettingsSkeleton } from "@/components/shell/settings/SettingsSkeleton"
import {
  IntegrationDetail,
  IntegrationStatus
} from "@/features/integrations/components/IntegrationDetail"
import { useEmailState } from "@/features/integrations/hooks/useOrgIntegrations"
import { emailRequest, orgEmail } from "@/features/organizations/atoms/email"
import { orgDetail, orgRequest } from "@/features/organizations/atoms/orgs"
import { OrgEmailForm } from "@/features/organizations/forms/org-email"
import { useOrgActor } from "@/lib/access"
import { m } from "@/paraglide/messages"

const routeApi = getRouteApi(
  "/_authed/orgs/$orgSlug/settings/integrations/email"
)

export function EmailSettings() {
  const { orgSlug } = routeApi.useParams()
  const state = useEmailState(orgSlug)
  return (
    <IntegrationDetail
      orgSlug={orgSlug}
      kind="email"
      name={m.org_email_heading()}
      description={m.org_integrations_email_card()}
      about={m.org_integrations_email_about()}
      meta={[
        {
          label: m.org_integrations_meta_status(),
          value: <IntegrationStatus tone={state.tone} label={state.label} />
        },
        {
          label: m.org_integrations_meta_category(),
          value: m.org_integrations_category_infrastructure()
        },
        {
          label: m.org_integrations_meta_scope(),
          value: m.org_integrations_scope_org()
        }
      ]}
    >
      <EmailContent />
    </IntegrationDetail>
  )
}

function EmailContent() {
  const { orgSlug } = routeApi.useParams()
  const orgResult = useAtomValue(orgDetail(orgRequest(orgSlug)))
  const canManage = useOrgActor(orgSlug).call("orgEmail", "get")
  return (
    <AsyncView
      result={orgResult}
      contained
      onInitial={() => <SettingsSkeleton />}
      onSuccess={() =>
        canManage ? (
          <EmailConnection key={orgSlug} orgSlug={orgSlug} />
        ) : (
          <p className="text-sm text-muted-foreground">
            {m.org_email_forbidden()}
          </p>
        )
      }
    />
  )
}

function EmailConnection({ orgSlug }: Readonly<{ orgSlug: string }>) {
  const result = useAtomValue(orgEmail(emailRequest(orgSlug)))
  return (
    <AsyncView
      result={result}
      contained
      onInitial={() => <SettingsSkeleton />}
      onSuccess={({ value, waiting }) => (
        <OrgEmailForm orgSlug={orgSlug} status={value} waiting={waiting} />
      )}
    />
  )
}
