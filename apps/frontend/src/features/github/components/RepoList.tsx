import { useAtomSet, useAtomValue } from "@effect/atom-react"
import type { GithubRepo } from "@pp/shared"
import { useDebouncedValue } from "@tanstack/react-pacer"
import * as Exit from "effect/Exit"
import * as Result from "effect/reactivity/AsyncResult"
import { ChevronLeft, Lock } from "lucide-react"
import { useState } from "react"

import {
  DropdownMenuInput,
  DropdownMenuItem,
  DropdownMenuList
} from "@/components/ui/dropdown-menu"
import { MenuNote } from "@/components/ui/menu-note"
import {
  connectGithub,
  githubRepos,
  githubReposRequest
} from "@/features/github/atoms/github"
import { useConnectGithubError } from "@/features/github/hooks/useConnectGithubError"
import { useProjectRepos } from "@/features/github/hooks/useProjectRepos"
import { projectRequest } from "@/features/projects/atoms/projects"
import { useProjectRoute } from "@/features/projects/hooks/useProject"
import { cn } from "@/lib/utils"
import { m } from "@/paraglide/messages"

export function RepoList({
  query,
  installationId,
  account,
  onConnected
}: Readonly<{
  query: string
  installationId: string
  account: Readonly<{ login: string; onChange: () => void }> | null
  onConnected: () => void
}>) {
  const { orgSlug, slug } = useProjectRoute()
  const req = projectRequest(orgSlug, slug)
  const connect = useAtomSet(connectGithub(req), { mode: "promiseExit" })
  const [pending, setPending] = useState<string | null>(null)
  const [debouncedQuery] = useDebouncedValue(query, { wait: 300 })
  const reposReq = githubReposRequest(
    orgSlug,
    slug,
    debouncedQuery,
    installationId
  )
  const repos = useAtomValue(githubRepos(reposReq))
  const connectedIds = new Set(useProjectRepos().map((repo) => repo.repoId))
  const connectError = useConnectGithubError(orgSlug, slug)
  const error = pending === null ? connectError : null

  async function pick(repo: GithubRepo) {
    if (pending !== null) return
    const key = `${repo.owner}/${repo.name}`
    setPending(key)
    const exit = await connect({
      repoId: repo.id,
      repoOwner: repo.owner,
      repoName: repo.name,
      defaultBaseBranch: repo.defaultBranch,
      installationId
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
      {account === null ? null : (
        <DropdownMenuItem
          label={account.login}
          closeOnClick={false}
          onClick={account.onChange}
        >
          <ChevronLeft />
          <span className="min-w-0 flex-1 truncate text-foreground">
            {account.login}
          </span>
          <span data-menu-meta className="text-micro text-muted-foreground">
            {m.github_chip_change_account()}
          </span>
        </DropdownMenuItem>
      )}
      {error ? <MenuNote tone="error">{error}</MenuNote> : null}
      {Result.matchWithError(repos, {
        onInitial: () => <MenuNote>{m.chrome_loading()}</MenuNote>,
        onError: () => (
          <MenuNote tone="error">{m.github_chip_load_repos_error()}</MenuNote>
        ),
        onDefect: () => (
          <MenuNote tone="error">{m.github_chip_load_repos_error()}</MenuNote>
        ),
        onSuccess: ({ value }) => {
          const available = value.repos.filter(
            (repo) => !connectedIds.has(repo.id)
          )
          return available.length === 0 ? (
            <MenuNote>{m.github_chip_no_repos()}</MenuNote>
          ) : (
            <DropdownMenuList className="max-h-72 overflow-y-auto">
              {available.map((repo) => {
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
                      />
                    ) : null}
                  </DropdownMenuItem>
                )
              })}
            </DropdownMenuList>
          )
        }
      })}
    </>
  )
}
