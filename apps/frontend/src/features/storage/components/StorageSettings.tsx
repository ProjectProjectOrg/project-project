import { useAtomValue } from "@effect/atom-react"
import type { OrgStorageStatus } from "@pp/shared"
import { getRouteApi } from "@tanstack/react-router"

import { AsyncView } from "@/components/shell/AsyncView"
import { SettingsSkeleton } from "@/components/shell/settings/SettingsSkeleton"
import {
  IntegrationDetail,
  IntegrationStatus
} from "@/features/integrations/components/IntegrationDetail"
import { useStorageState } from "@/features/integrations/hooks/useOrgIntegrations"
import { orgDetail, orgRequest } from "@/features/organizations/atoms/orgs"
import { orgStorage, storageRequest } from "@/features/projects/atoms/storage"
import { StorageConnectedPanel } from "@/features/storage/components/StorageConnectedPanel"
import { StorageConnectForm } from "@/features/storage/components/StorageConnectForm"
import { StorageStatusRows } from "@/features/storage/components/StorageStatusRows"
import { useOrgActor } from "@/lib/access"
import { m } from "@/paraglide/messages"

const routeApi = getRouteApi(
  "/_authed/orgs/$orgSlug/settings/integrations/storage/"
)

export function StorageSettings() {
  const { orgSlug } = routeApi.useParams()
  const state = useStorageState(orgSlug)
  return (
    <IntegrationDetail
      orgSlug={orgSlug}
      kind="storage"
      name={m.storage_heading()}
      description={m.org_integrations_storage_card()}
      about={m.org_integrations_storage_about()}
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
      <StorageContent />
    </IntegrationDetail>
  )
}

function StorageContent() {
  const { orgSlug } = routeApi.useParams()
  const orgResult = useAtomValue(orgDetail(orgRequest(orgSlug)))
  const storageResult = useAtomValue(orgStorage(storageRequest(orgSlug)))

  return (
    <AsyncView
      result={orgResult}
      contained
      onInitial={() => <SettingsSkeleton rows={2} />}
      onSuccess={() => (
        <AsyncView
          result={storageResult}
          contained
          onInitial={() => <SettingsSkeleton rows={2} />}
          onSuccess={({ value: status, waiting }) => (
            <StorageForm orgSlug={orgSlug} status={status} waiting={waiting} />
          )}
        />
      )}
    />
  )
}

function StorageForm({
  orgSlug,
  status,
  waiting
}: {
  orgSlug: string
  status: OrgStorageStatus
  waiting: boolean
}) {
  const canEdit = useOrgActor(orgSlug).call("storage", "connect")

  if (!canEdit) {
    return (
      <StorageStatusRows
        status={status}
        waiting={waiting}
        note={m.storage_error_forbidden()}
      />
    )
  }

  if (status.status === "not_connected") {
    return (
      <StorageConnectForm orgSlug={orgSlug} status={status} waiting={waiting} />
    )
  }

  return (
    <StorageConnectedPanel
      orgSlug={orgSlug}
      status={status}
      waiting={waiting}
    />
  )
}
