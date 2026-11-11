import { useAtomSet, useAtomValue } from "@effect/atom-react"
import type { GithubInstallation } from "@pp/shared"
import * as Result from "effect/reactivity/AsyncResult"
import { ChevronDown, ExternalLink } from "lucide-react"

import { SettingsRow } from "@/components/shell/settings/SettingsSection"
import { Button } from "@/components/ui/button"
import { ConfirmButton } from "@/components/ui/confirm-button"
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuRadioGroup,
  DropdownMenuSeparator,
  DropdownMenuTrigger
} from "@/components/ui/dropdown-menu"
import {
  deleteGithubInstallation,
  githubOrgRequest,
  updateGithubInstallation
} from "@/features/github/atoms/github"
import { toggledProjectSlug } from "@/features/github/lib/repos"
import {
  projectsFor,
  projectsRequest
} from "@/features/projects/atoms/projects"
import { mutationErrorText } from "@/lib/mutationError"
import { cn } from "@/lib/utils"
import { m } from "@/paraglide/messages"

const installationsUrl = (installation: GithubInstallation) =>
  installation.accountType === "Organization"
    ? `https://github.com/organizations/${installation.accountLogin}/settings/installations`
    : "https://github.com/settings/installations"

const accessLabel = (installation: GithubInstallation) =>
  installation.projectAccess === "all"
    ? m.github_installation_access_all()
    : m.github_installation_access_count({
        count: installation.projectSlugs.length
      })

export function InstallationRow({
  orgSlug,
  installation,
  canManage
}: Readonly<{
  orgSlug: string
  installation: GithubInstallation
  canManage: boolean
}>) {
  const request = {
    req: githubOrgRequest(orgSlug),
    installationId: installation.id
  }
  const accessState = useAtomValue(updateGithubInstallation(request))
  const remove = useAtomSet(deleteGithubInstallation(request), {
    mode: "promiseExit"
  })
  const accessError = accessState.waiting
    ? null
    : mutationErrorText(
        accessState,
        m.github_installation_access_error,
        m.github_installation_access_error
      )
  const broken =
    installation.status === "broken"
      ? (installation.lastCheckError ?? m.org_integrations_status_attention())
      : null

  return (
    <SettingsRow
      label={
        <a
          href={installationsUrl(installation)}
          target="_blank"
          rel="noreferrer"
          className="inline-flex items-center gap-1 transition-colors hover:text-muted-foreground"
        >
          {installation.accountLogin}
          <ExternalLink
            className="size-3 text-muted-foreground"
            strokeWidth={1.75}
            aria-label={m.github_chip_open_on_github()}
          />
        </a>
      }
      description={
        installation.accountType === "Organization"
          ? m.github_installation_account_org()
          : m.github_installation_account_personal()
      }
      error={broken ?? accessError}
    >
      {canManage ? (
        <>
          <ProjectAccessMenu
            orgSlug={orgSlug}
            installation={installation}
            waiting={accessState.waiting}
          />
          <ConfirmButton.Root>
            <ConfirmButton.Trigger type="button" variant="tertiary" size="sm">
              {m.github_installation_remove_button()}
            </ConfirmButton.Trigger>
            <ConfirmButton.Confirm>
              <ConfirmButton.Action
                prompt={m.github_installation_remove_confirm({
                  account: installation.accountLogin
                })}
                label={m.github_installation_remove_button()}
                describeError={() => m.github_installation_remove_error()}
                onConfirm={() => remove()}
              />
            </ConfirmButton.Confirm>
          </ConfirmButton.Root>
        </>
      ) : (
        <span className="text-[13px] text-muted-foreground">
          {accessLabel(installation)}
        </span>
      )}
    </SettingsRow>
  )
}

function ProjectAccessMenu({
  orgSlug,
  installation,
  waiting
}: Readonly<{
  orgSlug: string
  installation: GithubInstallation
  waiting: boolean
}>) {
  const update = useAtomSet(
    updateGithubInstallation({
      req: githubOrgRequest(orgSlug),
      installationId: installation.id
    })
  )
  const projectsResult = useAtomValue(projectsFor(projectsRequest(orgSlug)))
  const projects = Result.isSuccess(projectsResult) ? projectsResult.value : []
  const { projectAccess, projectSlugs } = installation

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <Button
            type="button"
            variant="tertiary"
            size="sm"
            trailingIcon={ChevronDown}
            aria-label={m.github_installation_access_label({
              account: installation.accountLogin,
              access: accessLabel(installation)
            })}
          >
            <span className={cn("tabular-nums", waiting && "animate-pulse")}>
              {accessLabel(installation)}
            </span>
          </Button>
        }
      />
      <DropdownMenuContent align="end" sideOffset={6} className="w-64">
        <DropdownMenuRadioGroup
          value={projectAccess}
          onValueChange={(next) =>
            update({ projectAccess: next, projectSlugs })
          }
          items={[
            {
              value: "all",
              label: m.github_installation_access_all(),
              closeOnClick: false
            },
            {
              value: "selected",
              label: m.github_installation_access_selected(),
              closeOnClick: false
            }
          ]}
        />
        {projectAccess === "selected" && projects.length > 0 ? (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuGroup className="max-h-64 overflow-y-auto">
              {projects.map((project) => (
                <DropdownMenuCheckboxItem
                  key={project.slug}
                  checked={projectSlugs.includes(project.slug)}
                  closeOnClick={false}
                  onCheckedChange={() =>
                    update({
                      projectAccess: "selected",
                      projectSlugs: toggledProjectSlug(
                        projectSlugs,
                        project.slug
                      )
                    })
                  }
                >
                  <span className="min-w-0 flex-1 truncate">
                    {project.name}
                  </span>
                </DropdownMenuCheckboxItem>
              ))}
            </DropdownMenuGroup>
          </>
        ) : null}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
