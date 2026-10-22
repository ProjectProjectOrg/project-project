import { useAtomValue } from "@effect/atom-react"
import { createFileRoute } from "@tanstack/react-router"
import * as Result from "effect/unstable/reactivity/AsyncResult"

import { ErrorPage } from "@/components/ErrorPage"
import {
  IntegrationDetail,
  IntegrationStatus
} from "@/components/settings/IntegrationDetail"
import { useEmailState } from "@/components/settings/orgIntegrations"
import { SettingsSkeleton } from "@/components/settings/SettingsSkeleton"
import { emailRequest, orgEmail } from "@/features/organizations/atoms/email"
import { orgDetail, orgRequest } from "@/features/organizations/atoms/orgs"
import { OrgEmailForm } from "@/forms/org-email"
import { useOrgActor } from "@/lib/access"
import { m } from "@/paraglide/messages"

export const Route = createFileRoute(
  "/_authed/orgs/$orgSlug/settings/integrations/email"
)({
  component: EmailSettings,
  loader: () => ({
    crumb: { type: "static" as const, label: m.org_email_heading() }
  })
})

function EmailSettings() {
  const { orgSlug } = Route.useParams()
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
  const { orgSlug } = Route.useParams()
  const orgResult = useAtomValue(orgDetail(orgRequest(orgSlug)))
  const canManage = useOrgActor(orgSlug).call("orgEmail", "get")
  return Result.matchWithError(orgResult, {
    onInitial: () => <SettingsSkeleton />,
    onError: (error) => <ErrorPage error={error} contained />,
    onDefect: (defect) => <ErrorPage error={defect} contained />,
    onSuccess: () =>
      canManage ? (
        <EmailConnection key={orgSlug} orgSlug={orgSlug} />
      ) : (
        <p className="text-sm text-muted-foreground">
          {m.org_email_forbidden()}
        </p>
      )
  })
}

function EmailConnection({ orgSlug }: Readonly<{ orgSlug: string }>) {
  const result = useAtomValue(orgEmail(emailRequest(orgSlug)))
  return Result.matchWithError(result, {
    onInitial: () => <SettingsSkeleton />,
    onError: (error) => <ErrorPage error={error} contained />,
    onDefect: (defect) => <ErrorPage error={defect} contained />,
    onSuccess: ({ value, waiting }) => (
      <OrgEmailForm orgSlug={orgSlug} status={value} waiting={waiting} />
    )
  })
}
