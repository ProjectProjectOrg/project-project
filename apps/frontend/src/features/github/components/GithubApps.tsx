import { useAtomSet } from "@effect/atom-react"
import type {
  GithubApp,
  GithubInstallation,
  GithubOrgIntegrationStatus
} from "@pp/shared"
import { useState } from "react"

import {
  SettingsGroup,
  SettingsRow,
  SettingsSection
} from "@/components/shell/settings/SettingsSection"
import { Button } from "@/components/ui/button"
import { ConfirmButton } from "@/components/ui/confirm-button"
import {
  deleteGithubApp,
  githubOrgRequest
} from "@/features/github/atoms/github"
import { AddGithubApp } from "@/features/github/components/AddGithubApp"
import { InstallationRow } from "@/features/github/components/InstallationRow"
import { useGithubInstall } from "@/features/github/hooks/useGithubInstall"
import { useOrgActor } from "@/hooks/useActor"
import { cn } from "@/lib/utils"
import { m } from "@/paraglide/messages"

export function GithubApps({
  orgSlug,
  status
}: Readonly<{ orgSlug: string; status: GithubOrgIntegrationStatus }>) {
  const actor = useOrgActor(orgSlug)
  const canManage = actor.call("projects", "startGithubAppManifest")
  const appIds = new Set(status.apps.map((app) => app.id))
  const unlinked = status.installations.filter(
    (installation) =>
      installation.appId === null || !appIds.has(installation.appId)
  )
  const empty = status.apps.length === 0 && unlinked.length === 0

  return (
    <SettingsSection
      title={m.github_apps_heading()}
      description={empty ? m.github_apps_empty() : m.github_apps_description()}
    >
      {status.apps.map((app) => (
        <AppGroup
          key={app.id}
          orgSlug={orgSlug}
          app={app}
          installations={status.installations.filter(
            (installation) => installation.appId === app.id
          )}
          canManage={canManage}
        />
      ))}
      {unlinked.length > 0 ? (
        <SettingsGroup>
          <SettingsRow
            label={m.github_apps_other_installations_label()}
            description={m.github_apps_other_installations_description()}
          />
          {unlinked.map((installation) => (
            <InstallationRow
              key={installation.id}
              orgSlug={orgSlug}
              installation={installation}
              canManage={canManage}
            />
          ))}
        </SettingsGroup>
      ) : null}
      {canManage ? <AddGithubApp orgSlug={orgSlug} /> : null}
    </SettingsSection>
  )
}

function AppGroup({
  orgSlug,
  app,
  installations,
  canManage
}: Readonly<{
  orgSlug: string
  app: GithubApp
  installations: ReadonlyArray<GithubInstallation>
  canManage: boolean
}>) {
  const { install, waiting, error } = useGithubInstall(orgSlug)
  const [attempted, setAttempted] = useState(false)
  const remove = useAtomSet(
    deleteGithubApp({ req: githubOrgRequest(orgSlug), appId: app.id }),
    { mode: "promiseExit" }
  )

  return (
    <SettingsGroup>
      <SettingsRow
        label={app.name}
        description={
          app.ownerLogin === null
            ? null
            : m.github_apps_owner({ owner: app.ownerLogin })
        }
        error={attempted ? error : null}
      >
        {canManage ? (
          <>
            <Button
              type="button"
              variant="tertiary"
              size="sm"
              onClick={() => {
                setAttempted(true)
                void install({ appId: app.id, returnProjectSlug: null })
              }}
              className={cn(attempted && waiting && "animate-pulse")}
            >
              {m.github_apps_install_button()}
            </Button>
            <ConfirmButton.Root>
              <ConfirmButton.Trigger type="button" variant="tertiary" size="sm">
                {m.github_apps_remove_button()}
              </ConfirmButton.Trigger>
              <ConfirmButton.Confirm>
                <ConfirmButton.Action
                  prompt={m.github_apps_remove_confirm({ name: app.name })}
                  label={m.github_apps_remove_button()}
                  describeError={() => m.github_apps_remove_error()}
                  onConfirm={() => remove()}
                />
              </ConfirmButton.Confirm>
            </ConfirmButton.Root>
          </>
        ) : null}
      </SettingsRow>
      {installations.length === 0 ? (
        <p className="px-4 py-3 text-xs text-muted-foreground">
          {m.github_apps_no_installations()}
        </p>
      ) : (
        installations.map((installation) => (
          <InstallationRow
            key={installation.id}
            orgSlug={orgSlug}
            installation={installation}
            canManage={canManage}
          />
        ))
      )}
    </SettingsGroup>
  )
}
