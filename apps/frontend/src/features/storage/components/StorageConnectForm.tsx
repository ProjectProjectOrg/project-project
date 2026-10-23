import { useAtomSet, useAtomValue } from "@effect/atom-react"
import type { OrgStorageStatus } from "@pp/shared"
import * as Exit from "effect/Exit"
import * as Result from "effect/reactivity/AsyncResult"
import { useState, type FormEvent } from "react"

import {
  SettingsGroup,
  SettingsRow,
  SettingsSection
} from "@/components/shell/settings/SettingsSection"
import {
  SettingsInput,
  SettingsSwitch
} from "@/components/shell/settings/SettingsTextField"
import { Button } from "@/components/ui/button"
import {
  connectStorage,
  storageRequest
} from "@/features/projects/atoms/storage"
import { StorageCorsPanel } from "@/features/storage/components/StorageCorsPanel"
import { StorageStatusRows } from "@/features/storage/components/StorageStatusRows"
import { errorMessage } from "@/lib/errorMessage"
import { m } from "@/paraglide/messages"

export function StorageConnectForm({
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
    onError: (err) => errorMessage(err),
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
