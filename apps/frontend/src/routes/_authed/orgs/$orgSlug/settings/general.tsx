import { useAtomSet, useAtomValue } from "@effect/atom-react"
import type { OrgDetail } from "@pp/shared"
import { createFileRoute } from "@tanstack/react-router"
import * as Result from "effect/unstable/reactivity/AsyncResult"

import { ErrorPage } from "@/components/ErrorPage"
import {
  SettingsGroup,
  SettingsRow,
  SettingsSection
} from "@/components/settings/SettingsSection"
import { SettingsSkeleton } from "@/components/settings/SettingsSkeleton"
import { SettingsTextField } from "@/components/settings/SettingsTextField"
import {
  orgDetail,
  orgRequest,
  renameOrg
} from "@/features/organizations/atoms/orgs"
import { useOrgActor } from "@/lib/access"
import { m } from "@/paraglide/messages"

export const Route = createFileRoute("/_authed/orgs/$orgSlug/settings/general")(
  {
    component: GeneralSettings,
    loader: () => ({
      crumb: { type: "static" as const, label: m.org_settings_general_tab() }
    })
  }
)

function GeneralSettings() {
  const { orgSlug } = Route.useParams()
  const result = useAtomValue(orgDetail(orgRequest(orgSlug)))

  return Result.matchWithError(result, {
    onInitial: () => <SettingsSkeleton rows={2} />,
    onError: (error) => <ErrorPage error={error} contained />,
    onDefect: (defect) => <ErrorPage error={defect} contained />,
    onSuccess: ({ value }) => <GeneralForm orgSlug={orgSlug} org={value} />
  })
}

function GeneralForm({ orgSlug, org }: { orgSlug: string; org: OrgDetail }) {
  const req = orgRequest(orgSlug)
  const rename = useAtomSet(renameOrg(req))
  const renameState = useAtomValue(renameOrg(req))
  const canEdit = useOrgActor(orgSlug).call("org", "rename")

  return (
    <SettingsSection>
      <SettingsGroup>
        <SettingsRow
          label={m.org_settings_name_label()}
          error={
            Result.isFailure(renameState) ? m.org_settings_rename_error() : null
          }
        >
          <SettingsTextField
            value={org.name}
            onCommit={(name) => rename({ name })}
            disabled={!canEdit}
            waiting={renameState.waiting}
            maxLength={120}
          />
        </SettingsRow>
        <SettingsRow
          label={m.org_settings_slug_label()}
          description={m.org_settings_slug_readonly_note()}
        >
          <span className="font-mono text-[13px] text-muted-foreground">
            {org.slug}
          </span>
        </SettingsRow>
      </SettingsGroup>
    </SettingsSection>
  )
}
