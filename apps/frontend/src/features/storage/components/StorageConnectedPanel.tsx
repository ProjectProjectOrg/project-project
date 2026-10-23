import { useAtomSet } from "@effect/atom-react"
import type { OrgStorageStatus } from "@pp/shared"
import { Link } from "@tanstack/react-router"
import { FolderOpen } from "lucide-react"

import {
  SettingsGroup,
  SettingsRow,
  SettingsSection
} from "@/components/shell/settings/SettingsSection"
import { Button } from "@/components/ui/button"
import { ConfirmButton } from "@/components/ui/confirm-button"
import {
  disconnectStorage,
  storageRequest
} from "@/features/projects/atoms/storage"
import { StorageCorsPanel } from "@/features/storage/components/StorageCorsPanel"
import { StorageStatusRows } from "@/features/storage/components/StorageStatusRows"
import { useOrgActor } from "@/lib/access"
import { m } from "@/paraglide/messages"

export function StorageConnectedPanel({
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
