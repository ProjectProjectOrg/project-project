import { useAtomSet, useAtomValue } from "@effect/atom-react"
import { Link } from "@tanstack/react-router"
import * as Match from "effect/Match"
import * as Result from "effect/reactivity/AsyncResult"

import { ErrorPage } from "@/components/shell/ErrorPage"
import { SettingsRow } from "@/components/shell/settings/SettingsSection"
import { Button } from "@/components/ui/button"
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
import { errorMessage } from "@/lib/errorMessage"
import { cn } from "@/lib/utils"
import { m } from "@/paraglide/messages"
import { getLocale } from "@/paraglide/runtime"

export function EverhourSettingsRow({
  orgSlug,
  slug,
  canManage
}: {
  orgSlug: string
  slug: string
  canManage: boolean
}) {
  const req = everhourProjectRequest(orgSlug, slug)
  const status = useAtomValue(everhourProjectStatusAtom(req))
  const viewer = useAtomValue(me())

  return Result.matchWithError(status, {
    onInitial: () => (
      <SettingsRow
        icon={<IntegrationLogo kind="everhour" />}
        label={m.project_settings_everhour_heading()}
        description={
          <span className="animate-pulse">
            {m.project_settings_everhour_loading()}
          </span>
        }
      />
    ),
    onError: (error) => <ErrorPage error={error} contained />,
    onDefect: (defect) => <ErrorPage error={defect} contained />,
    onSuccess: ({ value, waiting }) => {
      const user = Result.isSuccess(viewer) ? viewer.value : null
      const hasKey = user?.personalEverhour.connected === true
      return (
        <EverhourSettingsContent
          orgSlug={orgSlug}
          slug={slug}
          status={value}
          waiting={waiting}
          hasKey={hasKey}
          canManage={canManage}
        />
      )
    }
  })
}

function EverhourSettingsContent({
  orgSlug,
  slug,
  status,
  waiting,
  hasKey,
  canManage
}: {
  orgSlug: string
  slug: string
  status: {
    status: "not_connected" | "active" | "broken"
    everhourProjectId: string | null
    everhourProjectName: string | null
    lastSyncedAt: Date | null
    lastSyncStatus: "ok" | "error" | null
    lastSyncError: string | null
    needsSync: boolean
  }
  waiting: boolean
  hasKey: boolean
  canManage: boolean
}) {
  const req = everhourProjectRequest(orgSlug, slug)
  const connect = useAtomSet(connectEverhourProjectAtom(req), {
    mode: "promise"
  })
  const sync = useAtomSet(syncEverhourProjectAtom(req), { mode: "promise" })
  const disconnect = useAtomSet(disconnectEverhourProjectAtom(req), {
    mode: "promise"
  })
  const connectState = useAtomValue(connectEverhourProjectAtom(req))
  const syncState = useAtomValue(syncEverhourProjectAtom(req))
  const disconnectState = useAtomValue(disconnectEverhourProjectAtom(req))
  const busy =
    waiting ||
    connectState.waiting ||
    syncState.waiting ||
    disconnectState.waiting
  const mutationError =
    Result.matchWithError(connectState, {
      onInitial: () => null,
      onSuccess: () => null,
      onError: (err) => errorMessage(err),
      onDefect: () => m.project_settings_everhour_action_error()
    }) ??
    Result.matchWithError(syncState, {
      onInitial: () => null,
      onSuccess: () => null,
      onError: (err) => errorMessage(err),
      onDefect: () => m.project_settings_everhour_action_error()
    }) ??
    Result.matchWithError(disconnectState, {
      onInitial: () => null,
      onSuccess: () => null,
      onError: (err) => errorMessage(err),
      onDefect: () => m.project_settings_everhour_action_error()
    })
  const error =
    status.lastSyncStatus === "ok"
      ? null
      : (status.lastSyncError ?? mutationError)

  return (
    <SettingsRow
      icon={<IntegrationLogo kind="everhour" />}
      label={
        <span className="flex items-center gap-1">
          {m.project_settings_everhour_heading()}
          <EverhourApiKeyWalkthrough />
        </span>
      }
      description={
        <span className={cn("flex flex-col gap-0.5", busy && "animate-pulse")}>
          <span>
            {Match.value(status.status).pipe(
              Match.when("active", () =>
                m.project_settings_everhour_connected()
              ),
              Match.when("broken", () => m.project_settings_everhour_broken()),
              Match.orElse(() => m.project_settings_everhour_not_connected())
            )}
          </span>
          {status.everhourProjectId ? (
            <span className="font-mono">
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
      }
      error={error}
    >
      {!hasKey ? (
        <Button
          variant="tertiary"
          size="sm"
          render={<Link to="/profile/connections" />}
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
          onClick={() => void connect()}
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
            onClick={() => void sync()}
          >
            {m.project_settings_everhour_sync_button()}
          </Button>
          <Button
            type="button"
            variant="tertiary"
            size="sm"
            loading={disconnectState.waiting}
            disabled={busy}
            onClick={() => void disconnect()}
          >
            {m.project_settings_everhour_disconnect_button()}
          </Button>
        </>
      ) : null}
    </SettingsRow>
  )
}
