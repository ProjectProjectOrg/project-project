import { useAtomSet, useAtomValue } from "@effect/atom-react"
import type { OrgDetail } from "@pp/shared"
import { getRouteApi } from "@tanstack/react-router"
import * as Result from "effect/reactivity/AsyncResult"

import { AsyncView } from "@/components/shell/AsyncView"
import {
  SettingsGroup,
  SettingsRow,
  SettingsSection
} from "@/components/shell/settings/SettingsSection"
import { SettingsSkeleton } from "@/components/shell/settings/SettingsSkeleton"
import { SettingsTextField } from "@/components/shell/settings/SettingsTextField"
import {
  orgDetail,
  orgRequest,
  renameOrg
} from "@/features/organizations/atoms/orgs"
import { useOrgActor } from "@/lib/access"
import { m } from "@/paraglide/messages"

const routeApi = getRouteApi("/_authed/orgs/$orgSlug/settings/general")

export function OrgGeneralSettings() {
  const { orgSlug } = routeApi.useParams()
  const result = useAtomValue(orgDetail(orgRequest(orgSlug)))

  return (
    <AsyncView
      result={result}
      contained
      onInitial={() => <SettingsSkeleton rows={2} />}
      onSuccess={({ value }) => <GeneralForm orgSlug={orgSlug} org={value} />}
    />
  )
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
