import { useAtomSet, useAtomValue } from "@effect/atom-react"
import type { GithubConnection } from "@pp/shared"
import * as Result from "effect/reactivity/AsyncResult"
import { ExternalLink, GitBranch, MoreHorizontal, Unplug } from "lucide-react"
import { useRef } from "react"

import { SettingsRow } from "@/components/shell/settings/SettingsSection"
import { SettingsTextField } from "@/components/shell/settings/SettingsTextField"
import { Button } from "@/components/ui/button"
import { ConfirmButton } from "@/components/ui/confirm-button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger
} from "@/components/ui/dropdown-menu"
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
  const trigger = useRef<HTMLButtonElement>(null)
  const { projectReq } = useProjectRoute()
  const request = { req: projectReq, repoId: repo.repoId }
  const update = useAtomSet(updateGithubRepo(request))
  const updateState = useAtomValue(updateGithubRepo(request))
  const disconnect = useAtomSet(disconnectGithub(request), {
    mode: "promiseExit"
  })

  return (
    <ConfirmButton.Root bare>
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
              strokeWidth={1.75}
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
              <GitBranch
                className="size-3.5 text-muted-foreground"
                aria-hidden
              />
              <SettingsTextField
                value={repo.defaultBaseBranch ?? ""}
                placeholder="main"
                variant="compact"
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
                    ref={trigger}
                    type="button"
                    variant="quiet"
                    size="square-7"
                    aria-label={m.github_repos_actions_label({
                      repo: repoSlug(repo)
                    })}
                  >
                    <MoreHorizontal className="size-4" strokeWidth={1.75} />
                  </Button>
                }
              />
              <DropdownMenuContent align="end">
                <ConfirmButton.MenuItem variant="destructive">
                  <Unplug strokeWidth={1.75} />
                  {m.github_chip_disconnect_button()}
                </ConfirmButton.MenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </>
        ) : null}
      </SettingsRow>
      <ConfirmButton.Popover anchor={trigger} className="w-72">
        <ConfirmButton.Action
          layout="stacked"
          prompt={m.github_chip_disconnect_confirm({ repo: repoSlug(repo) })}
          label={m.github_chip_disconnect_button()}
          describeError={() => m.github_chip_disconnect_error()}
          onConfirm={() => disconnect()}
        />
      </ConfirmButton.Popover>
    </ConfirmButton.Root>
  )
}
