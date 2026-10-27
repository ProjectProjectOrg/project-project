import { useAtomSet, useAtomValue } from "@effect/atom-react"
import type { OrgStorageStatus } from "@pp/shared"
import * as Exit from "effect/Exit"

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
import { useAppForm } from "@/lib/form"
import { mutationErrorText } from "@/lib/mutationError"
import { m } from "@/paraglide/messages"

import {
  storageConnectionFormOpts,
  toConnectStorageInput,
  type StorageConnectionValues
} from "./opts"

type TextField = Exclude<keyof StorageConnectionValues, "forcePathStyle">

export function StorageConnectForm({
  orgSlug,
  status,
  waiting
}: Readonly<{
  orgSlug: string
  status: OrgStorageStatus
  waiting: boolean
}>) {
  const req = storageRequest(orgSlug)
  const connect = useAtomSet(connectStorage(req), { mode: "promiseExit" })
  const connectState = useAtomValue(connectStorage(req))
  const submitting = waiting || connectState.waiting
  const error = mutationErrorText(
    connectState,
    errorMessage,
    m.storage_error_fallback
  )
  const form = useAppForm({
    ...storageConnectionFormOpts,
    onSubmit: async ({ value }) => {
      const exit = await connect(toConnectStorageInput(value))
      if (Exit.isSuccess(exit)) form.setFieldValue("secretAccessKey", "")
    }
  })

  const field = (
    name: TextField,
    label: string,
    options: Readonly<{
      description?: string
      placeholder?: string
      type?: string
    }> = {}
  ) => (
    <form.Field name={name}>
      {(input) => (
        <SettingsRow
          label={label}
          description={options.description}
          error={input.errors.length > 0 ? m.validation_required() : null}
        >
          <SettingsInput
            type={options.type ?? "text"}
            autoComplete="off"
            value={input.value}
            placeholder={options.placeholder}
            onChange={(event) => input.handleChange(event.target.value)}
            onBlur={input.handleBlur}
            aria-invalid={input.errors.length > 0}
            disabled={submitting}
            className="w-72"
          />
        </SettingsRow>
      )}
    </form.Field>
  )

  return (
    <>
      <StorageStatusRows status={status} waiting={waiting} />
      <form
        onSubmit={(event) => {
          event.preventDefault()
          if (!submitting) void form.handleSubmit()
        }}
        className="flex flex-col gap-3"
      >
        <SettingsSection title={m.storage_section_bucket()}>
          <SettingsGroup>
            {field("endpoint", m.storage_endpoint_label(), {
              placeholder: m.storage_endpoint_placeholder()
            })}
            {field("bucket", m.storage_bucket_label())}
            {field("region", m.storage_region_label(), {
              description: m.storage_region_hint()
            })}
            {field("accessKeyId", m.storage_access_key_label())}
            {field("secretAccessKey", m.storage_secret_key_label(), {
              description: m.storage_secret_key_hint(),
              type: "password"
            })}
            {field("keyPrefix", m.storage_key_prefix_label(), {
              description: m.storage_key_prefix_hint()
            })}
            <form.Field name="forcePathStyle">
              {(input) => (
                <SettingsRow label={m.storage_force_path_style_label()}>
                  <SettingsSwitch
                    checked={input.value}
                    onCheckedChange={(checked) => input.handleChange(checked)}
                    disabled={submitting}
                  />
                </SettingsRow>
              )}
            </form.Field>
          </SettingsGroup>
        </SettingsSection>
        <div className="flex items-center justify-end gap-3">
          {error ? (
            <p role="alert" className="text-xs text-destructive">
              {error}
            </p>
          ) : null}
          <Button type="submit" size="sm" disabled={submitting}>
            {submitting ? m.storage_connecting() : m.storage_connect_button()}
          </Button>
        </div>
      </form>
      <StorageCorsPanel />
    </>
  )
}
