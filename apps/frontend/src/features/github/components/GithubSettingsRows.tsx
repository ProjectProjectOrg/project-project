import { useAtomSet, useAtomValue } from "@effect/atom-react"
import type { GithubConnection } from "@pp/shared"
import * as Exit from "effect/Exit"
import * as Result from "effect/reactivity/AsyncResult"
import { ExternalLink } from "lucide-react"

import { SettingsRow } from "@/components/shell/settings/SettingsSection"
import { SettingsTextField } from "@/components/shell/settings/SettingsTextField"
import { ConfirmButton } from "@/components/ui/confirm-button"
import { connectGithub, disconnectGithub } from "@/features/github/atoms/github"
import { ConnectMenu } from "@/features/github/components/ConnectMenu"
import { useCanManageGithub } from "@/features/github/hooks/useCanManageGithub"
import { useGithubWarning } from "@/features/github/hooks/useGithubWarning"
import { repoUrl } from "@/features/github/lib/branchUrl"
import { IntegrationLogo } from "@/features/integrations/components/IntegrationLogo"
import { projectRequest } from "@/features/projects/atoms/projects"
import { useProjectRoute } from "@/features/projects/hooks/useProject"
import { m } from "@/paraglide/messages"

export function GithubSettingsRows({
  github
}: Readonly<{ github: GithubConnection | null }>) {
  const { orgSlug, slug } = useProjectRoute()
  const canManage = useCanManageGithub(orgSlug)
  const warning = useGithubWarning(orgSlug, slug)
  const req = projectRequest(orgSlug, slug)
  const connect = useAtomSet(connectGithub(req))
  const connectFailed = Result.isFailure(useAtomValue(connectGithub(req)))
  const disconnect = useAtomSet(disconnectGithub(req), {
    mode: "promiseExit"
  })

  return (
    <>
      <SettingsRow
        icon={<IntegrationLogo kind="github" />}
        label={m.project_settings_github_heading()}
        description={
          github ? (
            <a
              href={repoUrl(github)}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1 hover:text-foreground"
            >
              {github.repoOwner}/{github.repoName}
              <ExternalLink className="size-3" strokeWidth={1.75} />
            </a>
          ) : (
            m.project_settings_github_not_connected()
          )
        }
        error={warning}
      >
        {canManage ? (
          github ? (
            <ConfirmButton.Root>
              <ConfirmButton.Trigger type="button" variant="tertiary" size="sm">
                {m.github_chip_disconnect_button()}
              </ConfirmButton.Trigger>
              <ConfirmButton.Confirm>
                <ConfirmButton.Action
                  prompt={m.github_chip_disconnect_confirm({
                    repo: `${github.repoOwner}/${github.repoName}`
                  })}
                  label={m.github_chip_disconnect_button()}
                  onConfirm={async () => Exit.isSuccess(await disconnect())}
                />
              </ConfirmButton.Confirm>
            </ConfirmButton.Root>
          ) : (
            <ConnectMenu />
          )
        ) : null}
      </SettingsRow>
      {github && canManage ? (
        <SettingsRow
          label={m.github_chip_default_base_branch_label()}
          description={m.github_chip_default_base_branch_hint()}
          error={connectFailed ? m.github_chip_connect_failed_error() : null}
        >
          <SettingsTextField
            value={github.defaultBaseBranch ?? ""}
            placeholder="main"
            allowEmpty
            onCommit={(next) =>
              connect({
                repoId: github.repoId,
                repoOwner: github.repoOwner,
                repoName: github.repoName,
                defaultBaseBranch: next || null
              })
            }
          />
        </SettingsRow>
      ) : null}
    </>
  )
}
