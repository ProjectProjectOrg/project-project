import { useAtomSet } from "@effect/atom-react"
import type {
  GithubApp,
  GithubInstallation,
  GithubOrgIntegrationStatus
} from "@pp/shared"
import { ChevronDown, ExternalLink } from "lucide-react"

import {
  SettingsGroup,
  SettingsRow,
  SettingsSection
} from "@/components/shell/settings/SettingsSection"
import { Button } from "@/components/ui/button"
import { ConfirmButton } from "@/components/ui/confirm-button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger
} from "@/components/ui/dropdown-menu"
import {
  deleteGithubApp,
  githubOrgRequest
} from "@/features/github/atoms/github"
import { AddGithubApp } from "@/features/github/components/AddGithubApp"
import { InstallationRow } from "@/features/github/components/InstallationRow"
import { useGithubInstall } from "@/features/github/hooks/useGithubInstall"
import { useOrgActor } from "@/hooks/useActor"
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

  return (
    <div className="flex flex-col gap-8">
      <SettingsSection
        title={m.github_apps_registration_heading()}
        description={m.github_apps_registration_description()}
        action={
          canManage && status.apps.length > 0 ? (
            <AddGithubApp orgSlug={orgSlug} variant="header" />
          ) : null
        }
      >
        {status.apps.length > 0 ? (
          <SettingsGroup>
            {status.apps.map((app) => (
              <AppRegistrationRow
                key={app.id}
                orgSlug={orgSlug}
                app={app}
                canManage={canManage}
              />
            ))}
          </SettingsGroup>
        ) : canManage ? (
          <AddGithubApp orgSlug={orgSlug} />
        ) : (
          <p className="text-caption text-muted-foreground">
            {m.github_apps_no_registrations()}
          </p>
        )}
      </SettingsSection>
      {status.apps.length > 0 || unlinked.length > 0 ? (
        <SettingsSection
          title={m.github_apps_installations_heading()}
          description={m.github_apps_installations_description()}
          action={
            canManage && status.apps.length > 0 ? (
              <ConnectGithubAccount orgSlug={orgSlug} apps={status.apps} />
            ) : null
          }
        >
          <div className="flex flex-col gap-6">
            {status.apps.map((app) => (
              <AppInstallations
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
              <SettingsSection
                title={m.github_apps_other_installations_label()}
                description={m.github_apps_other_installations_description()}
              >
                <SettingsGroup>
                  {unlinked.map((installation) => (
                    <InstallationRow
                      key={installation.id}
                      orgSlug={orgSlug}
                      installation={installation}
                      canManage={canManage}
                    />
                  ))}
                </SettingsGroup>
              </SettingsSection>
            ) : null}
          </div>
        </SettingsSection>
      ) : null}
    </div>
  )
}

function AppRegistrationRow({
  orgSlug,
  app,
  canManage
}: Readonly<{ orgSlug: string; app: GithubApp; canManage: boolean }>) {
  const remove = useAtomSet(
    deleteGithubApp({ req: githubOrgRequest(orgSlug), appId: app.id }),
    { mode: "promiseExit" }
  )

  return (
    <SettingsRow
      label={app.name}
      description={
        app.ownerLogin === null
          ? null
          : m.github_apps_owner({ owner: app.ownerLogin })
      }
    >
      {canManage ? (
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
      ) : null}
    </SettingsRow>
  )
}

function AppInstallations({
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
  return (
    <SettingsSection title={app.name}>
      {installations.length === 0 ? (
        <p className="text-caption text-muted-foreground">
          {m.github_apps_no_installations()}
        </p>
      ) : (
        <SettingsGroup>
          {installations.map((installation) => (
            <InstallationRow
              key={installation.id}
              orgSlug={orgSlug}
              installation={installation}
              canManage={canManage}
            />
          ))}
        </SettingsGroup>
      )}
    </SettingsSection>
  )
}

function ConnectGithubAccount({
  orgSlug,
  apps
}: Readonly<{ orgSlug: string; apps: ReadonlyArray<GithubApp> }>) {
  const { install, waiting, error } = useGithubInstall(orgSlug)
  const onlyApp = apps.length === 1 ? apps[0] : undefined
  const button = (
    <Button
      type="button"
      variant="tertiary"
      size="sm"
      disabled={waiting}
      trailingIcon={onlyApp ? ExternalLink : ChevronDown}
      onClick={
        onlyApp
          ? () => void install({ appId: onlyApp.id, returnProjectSlug: null })
          : undefined
      }
    >
      {m.github_apps_install_button()}
    </Button>
  )

  return (
    <div className="flex flex-col items-end gap-1">
      {onlyApp ? (
        button
      ) : (
        <DropdownMenu>
          <DropdownMenuTrigger render={button} />
          <DropdownMenuContent align="end">
            <DropdownMenuLabel>
              {m.github_apps_install_choose_app()}
            </DropdownMenuLabel>
            {apps.map((app) => (
              <DropdownMenuItem
                key={app.id}
                label={app.name}
                onClick={() =>
                  void install({ appId: app.id, returnProjectSlug: null })
                }
              >
                {app.name}
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
      )}
      {error ? (
        <p role="alert" className="text-caption text-destructive">
          {error}
        </p>
      ) : null}
    </div>
  )
}
