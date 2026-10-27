import { useAtomSet, useAtomValue } from "@effect/atom-react"
import * as Exit from "effect/Exit"
import * as Match from "effect/Match"
import * as Result from "effect/reactivity/AsyncResult"
import { GitBranch as GithubIcon } from "lucide-react"
import { useState } from "react"

import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger
} from "@/components/ui/dropdown-menu"
import {
  githubIntegration,
  githubOrgRequest,
  startGithubInstall
} from "@/features/github/atoms/github"
import { MenuNote } from "@/features/github/components/MenuNote"
import { RepoList } from "@/features/github/components/RepoList"
import { useProjectRoute } from "@/features/projects/hooks/useProject"
import { useOrgActor } from "@/lib/access"
import { mutationErrorText } from "@/lib/mutationError"
import { cn } from "@/lib/utils"
import { m } from "@/paraglide/messages"

export function ConnectMenu() {
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
