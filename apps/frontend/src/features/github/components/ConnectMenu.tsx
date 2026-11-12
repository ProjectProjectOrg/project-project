import { useAtomValue } from "@effect/atom-react"
import type { ProjectGithubInstallation } from "@pp/shared"
import { Link } from "@tanstack/react-router"
import * as Result from "effect/reactivity/AsyncResult"
import { AlertTriangle, GitBranch as GithubIcon, Settings2 } from "lucide-react"
import { useState } from "react"

import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger
} from "@/components/ui/dropdown-menu"
import { MenuNote } from "@/components/ui/menu-note"
import {
  githubIntegration,
  githubOrgRequest,
  projectGithubInstallations
} from "@/features/github/atoms/github"
import { RepoList } from "@/features/github/components/RepoList"
import { useConnectGithubError } from "@/features/github/hooks/useConnectGithubError"
import { useGithubInstall } from "@/features/github/hooks/useGithubInstall"
import { useProjectRoute } from "@/features/projects/hooks/useProject"
import { useOrgActor } from "@/hooks/useActor"
import { cn } from "@/lib/utils"
import { m } from "@/paraglide/messages"

export function ConnectMenu() {
  const { orgSlug, slug } = useProjectRoute()
  const connectError = useConnectGithubError(orgSlug, slug)
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
            leadingIcon={connectError ? AlertTriangle : GithubIcon}
            title={connectError ?? undefined}
            className={cn(connectError && "text-state-warning")}
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

function ConnectMenuBody({
  query,
  onConnected
}: Readonly<{
  query: string
  onConnected: () => void
}>) {
  const { projectReq } = useProjectRoute()
  const installations = useAtomValue(projectGithubInstallations(projectReq))
  const [pickedId, setPickedId] = useState<string | null>(null)

  if (Result.isInitial(installations)) {
    return <MenuNote>{m.chrome_loading()}</MenuNote>
  }
  if (Result.isFailure(installations)) {
    return (
      <MenuNote tone="error">{m.github_chip_load_accounts_error()}</MenuNote>
    )
  }

  const accounts = installations.value
  if (accounts.length === 0) return <SetupNote />

  const account =
    accounts.length === 1
      ? accounts[0]
      : accounts.find((candidate) => candidate.id === pickedId)
  if (account === undefined) {
    return <AccountList accounts={accounts} onPick={setPickedId} />
  }

  return (
    <RepoList
      query={query}
      installationId={account.id}
      account={
        accounts.length > 1
          ? { login: account.accountLogin, onChange: () => setPickedId(null) }
          : null
      }
      onConnected={onConnected}
    />
  )
}

function AccountList({
  accounts,
  onPick
}: Readonly<{
  accounts: ReadonlyArray<ProjectGithubInstallation>
  onPick: (installationId: string) => void
}>) {
  return (
    <>
      <MenuNote>{m.github_chip_choose_account()}</MenuNote>
      {accounts.map((account) => (
        <DropdownMenuItem
          key={account.id}
          label={account.accountLogin}
          closeOnClick={false}
          onClick={() => onPick(account.id)}
        >
          <span className="min-w-0 flex-1 truncate text-foreground">
            {account.accountLogin}
          </span>
          <span data-menu-meta className="text-micro text-muted-foreground">
            {account.accountType === "Organization"
              ? m.org_integrations_github_account_type_org()
              : m.org_integrations_github_account_type_user()}
          </span>
        </DropdownMenuItem>
      ))}
    </>
  )
}

function SetupNote() {
  const { orgSlug, slug } = useProjectRoute()
  const canInstall = useOrgActor(orgSlug).call("projects", "startGithubInstall")
  const integration = useAtomValue(githubIntegration(githubOrgRequest(orgSlug)))
  const { install, waiting, error } = useGithubInstall(orgSlug)

  if (Result.isInitial(integration)) {
    return <MenuNote>{m.chrome_loading()}</MenuNote>
  }

  const status = Result.isSuccess(integration) ? integration.value : null
  const installed = status !== null && status.installations.length > 0
  const onlyApp = status?.apps.length === 1 ? status.apps[0] : undefined

  return (
    <>
      <MenuNote tone={status === null ? "error" : "muted"}>
        {status === null
          ? m.github_chip_install_app_failed_error()
          : installed
            ? m.github_chip_no_accounts()
            : m.github_chip_install_app_required()}
      </MenuNote>
      {error ? <MenuNote tone="error">{error}</MenuNote> : null}
      <DropdownMenuSeparator />
      {!canInstall ? (
        <MenuNote>
          {installed
            ? m.github_chip_no_accounts_ask_admin()
            : m.github_chip_install_app_ask_admin()}
        </MenuNote>
      ) : onlyApp !== undefined && !installed ? (
        <DropdownMenuItem
          closeOnClick={false}
          onClick={() =>
            void install({ appId: onlyApp.id, returnProjectSlug: slug })
          }
        >
          <GithubIcon />
          <span className={cn(waiting && "animate-pulse")}>
            {waiting
              ? m.github_chip_install_app_loading()
              : m.github_chip_install_app_button()}
          </span>
        </DropdownMenuItem>
      ) : (
        <DropdownMenuItem
          render={
            <Link
              to="/orgs/$orgSlug/settings/integrations/github"
              params={{ orgSlug }}
            />
          }
        >
          <Settings2 />
          {m.github_chip_open_org_settings()}
        </DropdownMenuItem>
      )}
    </>
  )
}
