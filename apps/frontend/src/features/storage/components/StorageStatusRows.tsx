import type { OrgStorageStatus } from "@pp/shared"

import {
  SettingsGroup,
  SettingsRow,
  SettingsSection
} from "@/components/shell/settings/SettingsSection"
import { cn } from "@/lib/utils"
import { m } from "@/paraglide/messages"
import { getLocale } from "@/paraglide/runtime"

export function StorageStatusRows({
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
