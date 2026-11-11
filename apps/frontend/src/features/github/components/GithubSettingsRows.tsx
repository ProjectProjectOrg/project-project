import { useAtomSet, useAtomValue } from "@effect/atom-react"
import type { GithubConnection } from "@pp/shared"
import * as Result from "effect/reactivity/AsyncResult"
import { ExternalLink } from "lucide-react"

import { SettingsRow } from "@/components/shell/settings/SettingsSection"
import { SettingsTextField } from "@/components/shell/settings/SettingsTextField"
import { ConfirmButton } from "@/components/ui/confirm-button"
import {
  disconnectGithub,
  updateGithubRepo
} from "@/features/github/atoms/github"
import { ConnectMenu } from "@/features/github/components/ConnectMenu"
import { useCanManageGithub } from "@/features/github/hooks/useCanManageGithub"
import { useConnectGithubError } from "@/features/github/hooks/useConnectGithubError"
import { useGithubWarning } from "@/features/github/hooks/useGithubWarning"
import { repoUrl } from "@/features/github/lib/branchUrl"
import { repoSlug } from "@/features/github/lib/repos"
import { IntegrationLogo } from "@/features/integrations/components/IntegrationLogo"
import { useProjectRoute } from "@/features/projects/hooks/useProject"
import { m } from "@/paraglide/messages"

export function GithubSettingsRows({
  repos
}: Readonly<{ repos: ReadonlyArray<GithubConnection> }>) {
  const { orgSlug, slug } = useProjectRoute()
  const canManage = useCanManageGithub(orgSlug)
  const warning = useGithubWarning(orgSlug, slug)
  const connectError = useConnectGithubError(orgSlug, slug)

  return (
    <>
      <SettingsRow
        icon={<IntegrationLogo kind="github" />}
        label={m.project_settings_github_heading()}
        description={
          repos.length === 0
            ? m.project_settings_github_not_connected()
            : m.github_repos_connected_count({ count: repos.length })
        }
        error={connectError ?? warning}
      >
        {canManage ? <ConnectMenu /> : null}
      </SettingsRow>
      {repos.map((repo, index) => (
        <RepoRows
          key={repo.repoId}
          repo={repo}
          isDefault={index === 0 && repos.length > 1}
          canManage={canManage}
        />
      ))}
    </>
  )
}

function RepoRows({
  repo,
  isDefault,
  canManage
}: Readonly<{
  repo: GithubConnection
  isDefault: boolean
  canManage: boolean
}>) {
  const { projectReq } = useProjectRoute()
  const request = { req: projectReq, repoId: repo.repoId }
  const update = useAtomSet(updateGithubRepo(request))
  const updateState = useAtomValue(updateGithubRepo(request))
  const disconnect = useAtomSet(disconnectGithub(request), {
    mode: "promiseExit"
  })

  return (
    <>
      <SettingsRow
        label={
          <a
            href={repoUrl(repo)}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1 transition-colors hover:text-muted-foreground"
          >
            {repoSlug(repo)}
            <ExternalLink
              className="size-3 text-muted-foreground"
              strokeWidth={1.75}
              aria-label={m.github_chip_open_on_github()}
            />
          </a>
        }
        description={isDefault ? m.github_repos_default() : null}
      >
        {canManage ? (
          <ConfirmButton.Root>
            <ConfirmButton.Trigger type="button" variant="tertiary" size="sm">
              {m.github_chip_disconnect_button()}
            </ConfirmButton.Trigger>
            <ConfirmButton.Confirm>
              <ConfirmButton.Action
                prompt={m.github_chip_disconnect_confirm({
                  repo: repoSlug(repo)
                })}
                label={m.github_chip_disconnect_button()}
                describeError={() => m.github_chip_disconnect_error()}
                onConfirm={() => disconnect()}
              />
            </ConfirmButton.Confirm>
          </ConfirmButton.Root>
        ) : null}
      </SettingsRow>
      {canManage ? (
        <SettingsRow
          label={m.github_chip_default_base_branch_label()}
          description={m.github_chip_default_base_branch_hint()}
          error={
            Result.isFailure(updateState) && !updateState.waiting
              ? m.github_chip_connect_failed_error()
              : null
          }
        >
          <SettingsTextField
            value={repo.defaultBaseBranch ?? ""}
            placeholder="main"
            allowEmpty
            waiting={updateState.waiting}
            onCommit={(next) =>
              update({
                repoId: repo.repoId,
                repoOwner: repo.repoOwner,
                repoName: repo.repoName,
                defaultBaseBranch: next || null
              })
            }
          />
        </SettingsRow>
      ) : null}
    </>
  )
}
