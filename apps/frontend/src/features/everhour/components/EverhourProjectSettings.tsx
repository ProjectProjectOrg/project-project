import { useAtomSet, useAtomValue } from "@effect/atom-react"
import type { EverhourProjectIntegrationStatus } from "@pp/shared"
import { Button } from "@pp/ui/button"
import { cn } from "@pp/ui/lib/utils"
import { Link } from "@tanstack/react-router"
import * as Match from "effect/Match"
import * as Result from "effect/reactivity/AsyncResult"

import { AsyncView } from "@/components/shell/AsyncView"
import { SettingsRow } from "@/components/shell/settings/SettingsSection"
import { me } from "@/features/auth/atoms/auth"
import {
  connectEverhourProjectAtom,
  disconnectEverhourProjectAtom,
  everhourProjectRequest,
  everhourProjectStatusAtom,
  syncEverhourProjectAtom
} from "@/features/everhour/atoms/everhour"
import { EverhourApiKeyWalkthrough } from "@/features/everhour/components/EverhourApiKeyWalkthrough"
import { IntegrationLogo } from "@/features/integrations/components/IntegrationLogo"
import { useProjectRoute } from "@/features/projects/hooks/useProject"
import { errorMessage } from "@/lib/errorMessage"
import { mutationErrorText } from "@/lib/mutationError"
import { m } from "@/paraglide/messages"
import { getLocale } from "@/paraglide/runtime"

export function EverhourSettingsRow({ canManage }: { canManage: boolean }) {
  const { orgSlug, slug } = useProjectRoute()
  const req = everhourProjectRequest(orgSlug, slug)
  const status = useAtomValue(everhourProjectStatusAtom(req))
  const viewer = useAtomValue(me())

  return (
    <AsyncView
      result={status}
      contained
      onInitial={() => (
        <SettingsRow
          icon={<IntegrationLogo kind="everhour" />}
          label={m.project_settings_everhour_heading()}
          description={
            <span className="animate-pulse">
              {m.project_settings_everhour_loading()}
            </span>
          }
        />
      )}
      onSuccess={({ value, waiting }) => {
        const user = Result.isSuccess(viewer) ? viewer.value : null
        const hasKey = user?.personalEverhour.connected === true
        return (
          <EverhourSettingsContent
            status={value}
            waiting={waiting}
            hasKey={hasKey}
            canManage={canManage}
          />
        )
      }}
    />
  )
}

type EverhourSettingsProps = Readonly<{
  status: EverhourProjectIntegrationStatus
  waiting: boolean
  hasKey: boolean
  canManage: boolean
}>

function EverhourSettingsContent({
  status,
  waiting,
  hasKey,
  canManage
}: EverhourSettingsProps) {
  const { orgSlug, slug } = useProjectRoute()
  const req = everhourProjectRequest(orgSlug, slug)
  const connect = useAtomSet(connectEverhourProjectAtom(req))
  const sync = useAtomSet(syncEverhourProjectAtom(req))
  const disconnect = useAtomSet(disconnectEverhourProjectAtom(req))
  const connectState = useAtomValue(connectEverhourProjectAtom(req))
  const syncState = useAtomValue(syncEverhourProjectAtom(req))
  const disconnectState = useAtomValue(disconnectEverhourProjectAtom(req))
  const busy =
    waiting ||
    connectState.waiting ||
    syncState.waiting ||
    disconnectState.waiting
  const mutationError =
    mutationErrorText(
      connectState,
      errorMessage,
      m.project_settings_everhour_action_error
    ) ??
    mutationErrorText(
      syncState,
      errorMessage,
      m.project_settings_everhour_action_error
    ) ??
    mutationErrorText(
      disconnectState,
      errorMessage,
      m.project_settings_everhour_action_error
    )
  const error =
    mutationError ??
    (status.lastSyncStatus === "ok" ? null : status.lastSyncError)

  return (
    <SettingsRow
      icon={<IntegrationLogo kind="everhour" />}
      label={
        <span className="flex items-center gap-1">
          {m.project_settings_everhour_heading()}
          <EverhourApiKeyWalkthrough />
        </span>
      }
      description={<EverhourStatusDescription status={status} busy={busy} />}
      error={error}
    >
      {!hasKey ? (
        <Button
          variant="tertiary"
          size="sm"
          render={<Link to="/settings/profile/connections" />}
        >
          {m.project_settings_everhour_connect_profile_button()}
        </Button>
      ) : null}
      {canManage && hasKey && status.status === "not_connected" ? (
        <Button
          type="button"
          size="sm"
          loading={connectState.waiting}
          disabled={busy}
          onClick={() => connect()}
        >
          {m.project_settings_everhour_connect_button()}
        </Button>
      ) : null}
      {canManage && hasKey && status.status !== "not_connected" ? (
        <>
          <Button
            type="button"
            variant="tertiary"
            size="sm"
            loading={syncState.waiting}
            disabled={busy}
            onClick={() => sync()}
          >
            {m.project_settings_everhour_sync_button()}
          </Button>
          <Button
            type="button"
            variant="tertiary"
            size="sm"
            loading={disconnectState.waiting}
            disabled={busy}
            onClick={() => disconnect()}
          >
            {m.project_settings_everhour_disconnect_button()}
          </Button>
        </>
      ) : null}
    </SettingsRow>
  )
}

function EverhourStatusDescription({
  status,
  busy
}: Readonly<{ status: EverhourSettingsProps["status"]; busy: boolean }>) {
  return (
    <span className={cn("flex flex-col gap-0.5", busy && "animate-pulse")}>
      <span>
        {Match.value(status.status).pipe(
          Match.when("active", () => m.project_settings_everhour_connected()),
          Match.when("broken", () => m.project_settings_everhour_broken()),
          Match.orElse(() => m.project_settings_everhour_not_connected())
        )}
      </span>
      {status.everhourProjectId ? (
        <span className="tabular-nums">
          {status.everhourProjectName} · {status.everhourProjectId}
        </span>
      ) : null}
      {status.lastSyncedAt ? (
        <span>
          {m.project_settings_everhour_last_synced({
            date: status.lastSyncedAt.toLocaleString(getLocale())
          })}
        </span>
      ) : null}
    </span>
  )
}
