import { useAtomSet, useAtomValue } from "@effect/atom-react"
import { Link, createFileRoute } from "@tanstack/react-router"
import * as Match from "effect/Match"
import * as Result from "effect/reactivity/AsyncResult"

import { ErrorPage } from "@/components/shell/ErrorPage"
import {
  SettingsGroup,
  SettingsRow,
  SettingsSection
} from "@/components/shell/settings/SettingsSection"
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
import { FigmaProjectSettings } from "@/features/figma/components/FigmaProjectSettings"
import { GithubSettingsRows } from "@/features/github/components/GithubChip"
import { IntegrationLogo } from "@/features/integrations/components/IntegrationLogo"
import {
  projectRequest,
  updateProjectSetup
} from "@/features/projects/atoms/projects"
import { useProject } from "@/features/projects/hooks/useProject"
import {
  SlackProjectEvents,
  SlackProjectRow
} from "@/features/slack/components/ProjectSettings"
import { useProjectActor } from "@/lib/access"
import { errorMessage } from "@/lib/errorMessage"
import { cn } from "@/lib/utils"
import { m } from "@/paraglide/messages"
import { getLocale } from "@/paraglide/runtime"

export const Route = createFileRoute(
  "/_authed/orgs/$orgSlug/projects/$slug/settings/integrations"
)({
  component: IntegrationsSettings,
  loader: () => ({
    crumb: {
      type: "static" as const,
      label: m.project_settings_integrations_tab()
    }
  })
})

function IntegrationsSettings() {
  const { orgSlug } = Route.useParams()
  const project = useProject()
  const req = projectRequest(orgSlug, project.slug)
  const update = useAtomSet(updateProjectSetup(req))
  const actor = useProjectActor()

  const canManageSlack = actor.call("slack", "saveProject")

  return (
    <>
      <SettingsSection>
        <SettingsGroup>
          {actor.call("projects", "gitStates") ? (
            <GithubSettingsRows
              orgSlug={orgSlug}
              slug={project.slug}
              github={project.github}
            />
          ) : (
            <SettingsRow
              icon={<IntegrationLogo kind="github" />}
              label={m.project_settings_github_heading()}
              description={
                project.github
                  ? `${project.github.repoOwner}/${project.github.repoName}`
                  : m.project_settings_github_not_connected()
              }
            />
          )}
          {project.setup.connectGithubDismissedAt &&
          actor.call("projects", "updateSetup") ? (
            <SettingsRow label={m.project_setup_github_dismissed_note()}>
              <Button
                variant="tertiary"
                size="sm"
                onClick={() => update({ connectGithubDismissedAt: null })}
              >
                {m.project_setup_restore_button()}
              </Button>
            </SettingsRow>
          ) : null}
          {actor.call("everhour", "projectStatus") && (
            <EverhourSettingsRow
              orgSlug={orgSlug}
              slug={project.slug}
              canManage={actor.call("everhour", "connectProject")}
            />
          )}
          <FigmaProjectSettings
            orgSlug={orgSlug}
            slug={project.slug}
            canManage={actor.call("figma", "connectProject")}
          />
          <SlackProjectRow
            orgSlug={orgSlug}
            slug={project.slug}
            canManage={canManageSlack}
          />
        </SettingsGroup>
      </SettingsSection>
      <SlackProjectEvents
        orgSlug={orgSlug}
        slug={project.slug}
        canManage={canManageSlack}
      />
    </>
  )
}

function EverhourSettingsRow({
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
