import { useAtomSet, useAtomValue } from "@effect/atom-react"
import type { GithubConnection, GithubRepo } from "@pp/shared"
import { useDebouncedValue } from "@tanstack/react-pacer"
import { Link } from "@tanstack/react-router"
import * as Exit from "effect/Exit"
import * as Match from "effect/Match"
import * as Result from "effect/reactivity/AsyncResult"
import {
  AlertTriangle,
  ChevronDown,
  ExternalLink,
  GitBranch as GithubIcon,
  Lock,
  Settings2
} from "lucide-react"
import { type ReactNode, useState } from "react"

import { SettingsRow } from "@/components/shell/settings/SettingsSection"
import { SettingsTextField } from "@/components/shell/settings/SettingsTextField"
import { Button } from "@/components/ui/button"
import { ConfirmButton } from "@/components/ui/confirm-button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuInput,
  DropdownMenuItem,
  DropdownMenuList,
  DropdownMenuSeparator,
  DropdownMenuTrigger
} from "@/components/ui/dropdown-menu"
import { me } from "@/features/auth/atoms/auth"
import {
  connectGithub,
  disconnectGithub,
  githubIntegration,
  githubOrgRequest,
  githubRepos,
  githubReposRequest,
  projectGitStates,
  startGithubInstall
} from "@/features/github/atoms/github"
import { IntegrationLogo } from "@/features/integrations/components/IntegrationLogo"
import { projectRequest } from "@/features/projects/atoms/projects"
import { useProjectRoute } from "@/features/projects/hooks/useProject"
import { useOrgActor, useProjectActor } from "@/lib/access"
import { mutationErrorText } from "@/lib/mutationError"
import { cn } from "@/lib/utils"
import { m } from "@/paraglide/messages"

type Props = Readonly<{
  github: GithubConnection | null
}>

function useCanManageGithub(orgSlug: string): boolean {
  const viewer = useAtomValue(me())
  return (
    useProjectActor().call("projects", "connectGithub") &&
    Result.isSuccess(viewer) &&
    viewer.value.activeOrgSlug === orgSlug
  )
}

function useGithubWarning(orgSlug: string, slug: string): string | null {
  const req = projectRequest(orgSlug, slug)
  const states = useAtomValue(projectGitStates(req))
  if (!Result.isSuccess(states)) return null
  const { tokenStatus, repoStatus } = states.value
  if (tokenStatus === "expired") return m.git_github_token_expired_error()
  if (tokenStatus === "scope_insufficient")
    return m.git_github_scope_insufficient_error()
  if (repoStatus === "gone") return m.git_repo_gone_error()
  return null
}

const repoUrl = (github: GithubConnection) =>
  `https://github.com/${github.repoOwner}/${github.repoName}`

function RepoName({ owner, name }: Readonly<{ owner: string; name: string }>) {
  return (
    <span className="min-w-0 truncate">
      <span className="text-muted-foreground">{owner}/</span>
      <span className="text-foreground">{name}</span>
    </span>
  )
}

export function GithubChip({ github }: Props) {
  const { orgSlug, slug } = useProjectRoute()
  const canManage = useCanManageGithub(orgSlug)
  const warning = useGithubWarning(orgSlug, slug)

  if (!github) {
    return canManage ? <ConnectMenu /> : null
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <Button
            type="button"
            variant="tertiary"
            size="sm"
            leadingIcon={warning ? AlertTriangle : GithubIcon}
            trailingIcon={ChevronDown}
            title={warning ?? undefined}
            className={cn(warning && "text-state-warning")}
          >
            <RepoName owner={github.repoOwner} name={github.repoName} />
          </Button>
        }
      />
      <DropdownMenuContent align="end" sideOffset={6} className="w-60">
        {warning ? (
          <>
            <MenuNote tone="error">{warning}</MenuNote>
            <DropdownMenuSeparator />
          </>
        ) : null}
        <DropdownMenuItem
          render={
            <a href={repoUrl(github)} target="_blank" rel="noreferrer">
              <ExternalLink strokeWidth={1.75} />
              {m.github_chip_open_on_github()}
            </a>
          }
        />
        {canManage ? (
          <DropdownMenuItem
            render={
              <Link
                to="/orgs/$orgSlug/projects/$slug/settings/integrations"
                params={{ orgSlug, slug }}
              >
                <Settings2 strokeWidth={1.75} />
                {m.github_chip_repository_settings()}
              </Link>
            }
          />
        ) : null}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

export function GithubSettingsRows({ github }: Props) {
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

function ConnectMenu() {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState("")
  return (
    <DropdownMenu
      open={open}
      onOpenChange={setOpen}
      onOpenChangeComplete={(next) => {
        if (!next) setQuery("")
      }}
      filterable={{ value: query, onValueChange: setQuery, filter: null }}
    >
      <DropdownMenuTrigger
        render={
          <Button
            type="button"
            variant="tertiary"
            size="sm"
            leadingIcon={GithubIcon}
          >
            {m.github_chip_connect_repo_button()}
          </Button>
        }
      />
      <DropdownMenuContent align="end" sideOffset={6} className="w-80">
        <ConnectMenuBody query={query} onConnected={() => setOpen(false)} />
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

function MenuNote({
  tone = "muted",
  children
}: Readonly<{ tone?: "muted" | "error"; children: ReactNode }>) {
  return (
    <p
      role={tone === "error" ? "alert" : undefined}
      className={cn(
        "px-2 py-1.5 text-[13px] leading-5",
        tone === "error" ? "text-destructive" : "text-muted-foreground"
      )}
    >
      {children}
    </p>
  )
}

function ConnectMenuBody({
  query,
  onConnected
}: Readonly<{
  query: string
  onConnected: () => void
}>) {
  const { orgSlug, slug } = useProjectRoute()
  const canInstall = useOrgActor(orgSlug).call("projects", "startGithubInstall")
  const orgReq = githubOrgRequest(orgSlug)
  const orgIntegration = useAtomValue(githubIntegration(orgReq))
  const startInstall = useAtomSet(startGithubInstall(orgReq), {
    mode: "promiseExit"
  })
  const startInstallState = useAtomValue(startGithubInstall(orgReq))
  const installing = startInstallState.waiting
  const installError = installing
    ? null
    : mutationErrorText(
        startInstallState,
        (error) =>
          Match.value(error).pipe(
            Match.tag("Forbidden", () =>
              m.github_chip_install_app_forbidden_error()
            ),
            Match.orElse(() => m.github_chip_install_app_failed_error())
          ),
        m.github_chip_install_app_failed_error
      )

  async function installApp() {
    const exit = await startInstall({ returnProjectSlug: slug })
    if (Exit.isSuccess(exit)) window.location.assign(exit.value.installUrl)
  }

  if (Result.isInitial(orgIntegration)) {
    return <MenuNote>{m.chrome_loading()}</MenuNote>
  }

  if (
    Result.isFailure(orgIntegration) ||
    orgIntegration.value.status !== "active"
  ) {
    return (
      <>
        <MenuNote tone={Result.isFailure(orgIntegration) ? "error" : "muted"}>
          {Result.isFailure(orgIntegration)
            ? m.github_chip_install_app_failed_error()
            : m.github_chip_install_app_required()}
        </MenuNote>
        {installError ? <MenuNote tone="error">{installError}</MenuNote> : null}
        <DropdownMenuSeparator />
        {canInstall ? (
          <DropdownMenuItem
            closeOnClick={false}
            onClick={() => {
              if (!installing) void installApp()
            }}
          >
            <GithubIcon strokeWidth={1.75} />
            <span className={cn(installing && "animate-pulse")}>
              {installing
                ? m.github_chip_install_app_loading()
                : m.github_chip_install_app_button()}
            </span>
          </DropdownMenuItem>
        ) : (
          <MenuNote>{m.github_chip_install_app_ask_admin()}</MenuNote>
        )}
      </>
    )
  }

  return <RepoList query={query} onConnected={onConnected} />
}

function RepoList({
  query,
  onConnected
}: Readonly<{
  query: string
  onConnected: () => void
}>) {
  const { orgSlug, slug } = useProjectRoute()
  const req = projectRequest(orgSlug, slug)
  const connect = useAtomSet(connectGithub(req), { mode: "promiseExit" })
  const connectState = useAtomValue(connectGithub(req))
  const [pending, setPending] = useState<string | null>(null)
  const [debouncedQuery] = useDebouncedValue(query, { wait: 300 })
  const reposReq = githubReposRequest(orgSlug, slug, debouncedQuery)
  const repos = useAtomValue(githubRepos(reposReq))
  const error =
    connectState.waiting || pending !== null
      ? null
      : mutationErrorText(
          connectState,
          (failure) =>
            Match.value(failure).pipe(
              Match.tag("GitHubTokenExpired", () =>
                m.github_chip_connect_token_expired_error()
              ),
              Match.tag("GitHubScopeInsufficient", () =>
                m.github_chip_connect_scope_insufficient_error()
              ),
              Match.tag("RepoGone", () => m.git_repo_gone_error()),
              Match.orElse(() => m.github_chip_connect_failed_error())
            ),
          m.github_chip_connect_failed_error
        )

  async function pick(repo: GithubRepo) {
    if (pending !== null) return
    const key = `${repo.owner}/${repo.name}`
    setPending(key)
    const exit = await connect({
      repoId: repo.id,
      repoOwner: repo.owner,
      repoName: repo.name,
      defaultBaseBranch: repo.defaultBranch
    })
    setPending(null)
    if (Exit.isSuccess(exit)) onConnected()
  }

  return (
    <>
      <DropdownMenuInput
        placeholder={m.github_chip_search_repos_placeholder()}
        aria-label={m.github_chip_search_repos_placeholder()}
      />
      {error ? <MenuNote tone="error">{error}</MenuNote> : null}
      {Result.matchWithError(repos, {
        onInitial: () => <MenuNote>{m.chrome_loading()}</MenuNote>,
        onError: () => (
          <MenuNote tone="error">{m.github_chip_load_repos_error()}</MenuNote>
        ),
        onDefect: () => (
          <MenuNote tone="error">{m.github_chip_load_repos_error()}</MenuNote>
        ),
        onSuccess: ({ value }) =>
          value.repos.length === 0 ? (
            <MenuNote>{m.github_chip_no_repos()}</MenuNote>
          ) : (
            <DropdownMenuList className="max-h-72 overflow-y-auto">
              {value.repos.map((repo) => {
                const key = `${repo.owner}/${repo.name}`
                return (
                  <DropdownMenuItem
                    key={key}
                    label={key}
                    closeOnClick={false}
                    onClick={() => void pick(repo)}
                  >
                    <span
                      className={cn(
                        "min-w-0 flex-1 truncate",
                        pending === key && "animate-pulse"
                      )}
                    >
                      <span className="text-muted-foreground">
                        {repo.owner}/
                      </span>
                      <span className="text-foreground">{repo.name}</span>
                    </span>
                    {repo.private ? (
                      <Lock
                        aria-label={m.github_chip_repo_private()}
                        className="ml-auto size-3.5 text-muted-foreground"
                        strokeWidth={1.75}
                      />
                    ) : null}
                  </DropdownMenuItem>
                )
              })}
            </DropdownMenuList>
          )
      })}
    </>
  )
}
