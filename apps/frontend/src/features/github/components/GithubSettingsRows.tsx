import { useAtomSet, useAtomValue } from "@effect/atom-react"
import type { GithubConnection } from "@pp/shared"
import { Button } from "@pp/ui/button"
import {
  DropdownMenu,
  DropdownMenuConfirmItem,
  DropdownMenuContent,
  DropdownMenuTrigger
} from "@pp/ui/dropdown-menu"
import { ExternalLink, GitBranch, MoreHorizontal, Unplug } from "@pp/ui/icons"
import * as Result from "effect/reactivity/AsyncResult"

import { SettingsRow } from "@/components/shell/settings/SettingsSection"
import { SettingsTextField } from "@/components/shell/settings/SettingsTextField"
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
            : m.github_repos_settings_description()
        }
        error={connectError ?? warning}
      >
        {canManage ? <ConnectMenu /> : null}
      </SettingsRow>
      {repos.map((repo, index) => (
        <RepoRow
          key={repo.repoId}
          repo={repo}
          isDefault={index === 0 && repos.length > 1}
          canManage={canManage}
        />
      ))}
    </>
  )
}

function RepoRow({
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
    <SettingsRow
      error={
        Result.isFailure(updateState) && !updateState.waiting
          ? m.github_chip_connect_failed_error()
          : null
      }
      label={
        <a
          href={repoUrl(repo)}
          target="_blank"
          rel="noreferrer"
          className="inline-flex max-w-full min-w-0 items-center gap-1 transition-colors hover:text-muted-foreground"
        >
          <span className="truncate font-mono">{repoSlug(repo)}</span>
          <ExternalLink
            className="size-3 text-muted-foreground"

            aria-label={m.github_chip_open_on_github()}
          />
        </a>
      }
      description={isDefault ? m.github_repos_default() : null}
    >
      {canManage ? (
        <>
          <div
            className="flex items-center gap-1.5"
            title={m.github_chip_default_base_branch_hint()}
          >
            <GitBranch className="size-3.5 text-muted-foreground" aria-hidden />
            <SettingsTextField
              value={repo.defaultBaseBranch ?? ""}
              placeholder="main"
              size="sm"
              className="w-28 font-mono sm:w-36"
              aria-label={m.github_repos_base_branch_label({
                repo: repoSlug(repo)
              })}
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
          </div>
          <DropdownMenu>
            <DropdownMenuTrigger
              render={
                <Button
                  type="button"
                  variant="ghost"
                  size="square-7"
                  aria-label={m.github_repos_actions_label({
                    repo: repoSlug(repo)
                  })}
                >
                  <MoreHorizontal className="size-4" />
                </Button>
              }
            />
            <DropdownMenuContent align="end">
              <DropdownMenuConfirmItem
                icon={<Unplug />}
                label={m.github_chip_disconnect_button()}
                confirmLabel={m.github_chip_disconnect_confirm({
                  repo: repoSlug(repo)
                })}
                busyLabel={m.github_chip_disconnect_in_progress()}
                describeError={() => m.github_chip_disconnect_error()}
                onConfirm={() => disconnect()}
              />
            </DropdownMenuContent>
          </DropdownMenu>
        </>
      ) : null}
    </SettingsRow>
  )
}
