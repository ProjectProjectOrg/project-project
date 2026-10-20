import { useAtomSet, useAtomValue } from "@effect/atom-react"
import type { OrgStorageStatus } from "@pp/shared"
import { createFileRoute, Link } from "@tanstack/react-router"
import * as Exit from "effect/Exit"
import * as Result from "effect/unstable/reactivity/AsyncResult"
import { FolderOpen } from "lucide-react"
import { useState, type FormEvent } from "react"

import { ErrorPage } from "@/components/ErrorPage"
import {
  IntegrationDetail,
  IntegrationStatus
} from "@/components/settings/IntegrationDetail"
import { useStorageState } from "@/components/settings/orgIntegrations"
import {
  SettingsGroup,
  SettingsRow,
  SettingsSection
} from "@/components/settings/SettingsSection"
import { SettingsSkeleton } from "@/components/settings/SettingsSkeleton"
import {
  SettingsInput,
  SettingsSwitch
} from "@/components/settings/SettingsTextField"
import { StorageCorsPanel } from "@/components/StorageCorsPanel"
import { Button } from "@/components/ui/button"
import { ConfirmButton } from "@/components/ui/confirm-button"
import { orgDetail, orgRequest } from "@/features/organizations/atoms/orgs"
import {
  connectStorage,
  disconnectStorage,
  orgStorage,
  storageRequest
} from "@/features/projects/atoms/storage"
import { useOrgActor } from "@/lib/access"
import { type AppError, errorMessage } from "@/lib/errorMessage"
import { cn } from "@/lib/utils"
import { m } from "@/paraglide/messages"
import { getLocale } from "@/paraglide/runtime"

export const Route = createFileRoute(
  "/_authed/orgs/$orgSlug/settings/integrations/storage/"
)({
  component: StorageSettings
})

function StorageSettings() {
  const { orgSlug } = Route.useParams()
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
  const { orgSlug } = Route.useParams()
  const orgResult = useAtomValue(orgDetail(orgRequest(orgSlug)))
  const storageResult = useAtomValue(orgStorage(storageRequest(orgSlug)))

  return Result.matchWithError(orgResult, {
    onInitial: () => <SettingsSkeleton rows={2} />,
    onError: (error) => <ErrorPage error={error} contained />,
    onDefect: (defect) => <ErrorPage error={defect} contained />,
    onSuccess: () =>
      Result.matchWithError(storageResult, {
        onInitial: () => <SettingsSkeleton rows={2} />,
        onError: (error) => <ErrorPage error={error} contained />,
        onDefect: (defect) => <ErrorPage error={defect} contained />,
        onSuccess: ({ value: status, waiting }) => (
          <StorageForm orgSlug={orgSlug} status={status} waiting={waiting} />
        )
      })
  })
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

function StorageConnectForm({
  orgSlug,
  status,
  waiting
}: {
  orgSlug: string
  status: OrgStorageStatus
  waiting: boolean
}) {
  const req = storageRequest(orgSlug)
  const connect = useAtomSet(connectStorage(req), { mode: "promiseExit" })
  const connectState = useAtomValue(connectStorage(req))

  const [endpoint, setEndpoint] = useState("")
  const [bucket, setBucket] = useState("")
  const [region, setRegion] = useState("auto")
  const [accessKeyId, setAccessKeyId] = useState("")
  const [secretAccessKey, setSecretAccessKey] = useState("")
  const [keyPrefix, setKeyPrefix] = useState("")
  const [forcePathStyle, setForcePathStyle] = useState(true)

  const submitting = waiting || connectState.waiting
  const error = Result.matchWithError(connectState, {
    onInitial: () => null,
    onSuccess: () => null,
    onError: (err) => errorMessage(err as AppError),
    onDefect: () => m.storage_error_fallback()
  })

  const canSubmit =
    endpoint.trim().length > 0 &&
    bucket.trim().length > 0 &&
    region.trim().length > 0 &&
    accessKeyId.trim().length > 0 &&
    secretAccessKey.trim().length > 0

  async function onSubmit(event: FormEvent) {
    event.preventDefault()
    if (!canSubmit || submitting) return
    const exit = await connect({
      endpoint: endpoint.trim(),
      bucket: bucket.trim(),
      region: region.trim(),
      accessKeyId: accessKeyId.trim(),
      secretAccessKey,
      keyPrefix: keyPrefix.trim().length > 0 ? keyPrefix.trim() : null,
      forcePathStyle
    })
    if (Exit.isSuccess(exit)) setSecretAccessKey("")
  }

  const field = (
    label: string,
    value: string,
    onChange: (next: string) => void,
    options: Readonly<{
      description?: string
      placeholder?: string
      type?: string
    }> = {}
  ) => (
    <SettingsRow label={label} description={options.description}>
      <SettingsInput
        type={options.type ?? "text"}
        autoComplete="off"
        value={value}
        placeholder={options.placeholder}
        onChange={(event) => onChange(event.target.value)}
        disabled={submitting}
        className="w-72"
      />
    </SettingsRow>
  )

  return (
    <>
      <StorageStatusRows status={status} waiting={waiting} />
      <form onSubmit={onSubmit} className="flex flex-col gap-3">
        <SettingsSection title={m.storage_section_bucket()}>
          <SettingsGroup>
            {field(m.storage_endpoint_label(), endpoint, setEndpoint, {
              placeholder: m.storage_endpoint_placeholder()
            })}
            {field(m.storage_bucket_label(), bucket, setBucket)}
            {field(m.storage_region_label(), region, setRegion, {
              description: m.storage_region_hint()
            })}
            {field(m.storage_access_key_label(), accessKeyId, setAccessKeyId)}
            {field(
              m.storage_secret_key_label(),
              secretAccessKey,
              setSecretAccessKey,
              {
                description: m.storage_secret_key_hint(),
                type: "password"
              }
            )}
            {field(m.storage_key_prefix_label(), keyPrefix, setKeyPrefix, {
              description: m.storage_key_prefix_hint()
            })}
            <SettingsRow label={m.storage_force_path_style_label()}>
              <SettingsSwitch
                checked={forcePathStyle}
                onCheckedChange={setForcePathStyle}
                disabled={submitting}
              />
            </SettingsRow>
          </SettingsGroup>
        </SettingsSection>
        <div className="flex items-center justify-end gap-3">
          {error ? (
            <p role="alert" className="text-xs text-destructive">
              {error}
            </p>
          ) : null}
          <Button type="submit" size="sm" disabled={!canSubmit || submitting}>
            {submitting ? m.storage_connecting() : m.storage_connect_button()}
          </Button>
        </div>
      </form>
      <StorageCorsPanel />
    </>
  )
}

function StorageConnectedPanel({
  orgSlug,
  status,
  waiting
}: {
  orgSlug: string
  status: OrgStorageStatus
  waiting: boolean
}) {
  const disconnect = useAtomSet(disconnectStorage(storageRequest(orgSlug)), {
    mode: "promiseExit"
  })
  const canBrowse = useOrgActor(orgSlug).call("attachments", "list")

  return (
    <>
      <StorageStatusRows status={status} waiting={waiting} />
      {canBrowse ? (
        <SettingsSection>
          <SettingsGroup>
            <SettingsRow
              icon={
                <FolderOpen
                  className="size-4 text-muted-foreground"
                  strokeWidth={1.75}
                />
              }
              label={m.storage_files_title()}
              description={m.attachments_description()}
            >
              <Button
                variant="tertiary"
                size="sm"
                render={
                  <Link
                    to="/orgs/$orgSlug/settings/integrations/storage/files"
                    params={{ orgSlug }}
                  />
                }
              >
                {m.storage_files_browse_button()}
              </Button>
            </SettingsRow>
          </SettingsGroup>
        </SettingsSection>
      ) : null}
      <StorageCorsPanel />
      <SettingsSection>
        <SettingsGroup>
          <SettingsRow
            label={m.storage_disconnect_button()}
            description={m.storage_disconnect_hint()}
          >
            <ConfirmButton.Root>
              <ConfirmButton.Trigger
                type="button"
                variant="tertiary"
                size="sm"
                disabled={waiting}
              >
                {m.storage_disconnect_button()}
              </ConfirmButton.Trigger>
              <ConfirmButton.Confirm>
                <ConfirmButton.Action
                  prompt={m.storage_disconnect_confirm()}
                  label={m.storage_disconnect_button()}
                  onConfirm={disconnect}
                />
              </ConfirmButton.Confirm>
            </ConfirmButton.Root>
          </SettingsRow>
        </SettingsGroup>
      </SettingsSection>
    </>
  )
}

function StorageStatusRows({
  status,
  waiting,
  note
}: {
  status: OrgStorageStatus
  waiting: boolean
  note?: string
}) {
  const connected = status.status !== "not_connected"
  return (
    <SettingsSection>
      <SettingsGroup>
        <SettingsRow
          label={
            <span className={cn(waiting && "animate-pulse")}>
              {status.status === "broken"
                ? m.storage_broken()
                : connected
                  ? m.storage_connected()
                  : m.storage_not_connected()}
            </span>
          }
          description={
            note ?? (connected ? undefined : m.storage_not_connected_hint())
          }
          error={connected ? status.lastCheckError : null}
        />
        {connected ? (
          <>
            <ValueRow
              label={m.storage_endpoint_label()}
              value={status.endpoint}
            />
            <ValueRow label={m.storage_bucket_label()} value={status.bucket} />
            <ValueRow label={m.storage_region_label()} value={status.region} />
            <ValueRow
              label={m.storage_access_key_label()}
              value={status.accessKeyIdMasked}
            />
            {status.lastCheckedAt ? (
              <ValueRow
                label={m.storage_last_checked()}
                value={status.lastCheckedAt.toLocaleString(getLocale())}
              />
            ) : null}
          </>
        ) : null}
      </SettingsGroup>
    </SettingsSection>
  )
}

function ValueRow({ label, value }: { label: string; value: string | null }) {
  return (
    <SettingsRow label={label}>
      <span className="font-mono text-[13px] text-muted-foreground">
        {value ?? m.storage_value_none()}
      </span>
    </SettingsRow>
  )
}
