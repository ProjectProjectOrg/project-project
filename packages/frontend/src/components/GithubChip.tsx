// GithubChip — header-bar chip for a project's GitHub connection.
//
// Three render states:
//   1. not connected, owner/admin: "Connect repo" → popover with the picker
//   2. not connected, member:      nothing
//   3. connected:                  chip with repo, link to GitHub, optional
//                                  manage popover for owner/admin
//
// Token / repo failure modes shown by the parent layout via gitStates response.

import { Result, useAtomSet, useAtomValue } from "@effect-atom/atom-react"
import { Match } from "effect"
import {
  AlertTriangle,
  ChevronDown,
  GitBranch as GithubIcon,
  Search
} from "lucide-react"
import { useMemo, useState } from "react"
import {
  connectGithubAtom,
  disconnectGithubAtom,
  githubReposAtom,
  projectGitStatesAtom
} from "@/atoms/github"
import { projectKey } from "@/atoms/projects"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
  Popover,
  PopoverContent,
  PopoverTrigger
} from "@/components/ui/popover"
import { cn } from "@/lib/utils"
import { m } from "@/paraglide/messages"
import type { GithubConnection, GithubRepo, Role } from "@projectproject/shared"

type Props = {
  orgSlug: string
  slug: string
  github: GithubConnection | null
  callerRole: Role
}

export function GithubChip({ orgSlug, slug, github, callerRole }: Props) {
  const canManage = callerRole === "owner" || callerRole === "admin"
  const states = useAtomValue(projectGitStatesAtom(projectKey(orgSlug, slug)))

  const flag: "token_expired" | "scope" | "repo_gone" | null = useMemo(() => {
    if (!Result.isSuccess(states)) return null
    const v = states.value
    if (v.tokenStatus === "expired") return "token_expired"
    if (v.tokenStatus === "scope_insufficient") return "scope"
    if (v.repoStatus === "gone") return "repo_gone"
    return null
  }, [states])

  if (!github && !canManage) return null

  if (!github) {
    return (
      <Popover>
        <PopoverTrigger
          render={
            <button
              type="button"
              className="inline-flex items-center gap-1.5 rounded-md border border-border bg-background px-2.5 py-1 text-xs font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
            >
              <GithubIcon className="size-3.5" strokeWidth={1.75} />
              {m.github_chip_connect_repo_button()}
            </button>
          }
        />
        <PopoverContent className="w-80 p-0">
          <ConnectPanel orgSlug={orgSlug} slug={slug} />
        </PopoverContent>
      </Popover>
    )
  }

  return (
    <ConnectedChip
      orgSlug={orgSlug}
      slug={slug}
      github={github}
      flag={flag}
      canManage={canManage}
    />
  )
}

function ConnectedChip({
  orgSlug,
  slug,
  github,
  flag,
  canManage
}: {
  orgSlug: string
  slug: string
  github: GithubConnection
  flag: "token_expired" | "scope" | "repo_gone" | null
  canManage: boolean
}) {
  const url = `https://github.com/${github.repoOwner}/${github.repoName}`
  const warning =
    flag === "token_expired"
      ? m.git_github_token_expired_error()
      : flag === "scope"
        ? m.git_github_scope_insufficient_error()
        : flag === "repo_gone"
          ? m.git_repo_gone_error()
          : null

  if (warning) {
    return (
      <Badge tone="amber" size="md" className="border border-amber-500/40">
        <AlertTriangle strokeWidth={1.75} />
        <span>{warning}</span>
        {canManage && (
          <Popover>
            <PopoverTrigger
              render={
                <button
                  type="button"
                  className="ml-1 underline-offset-2 hover:underline"
                >
                  {m.github_chip_manage_button()}
                </button>
              }
            />
            <PopoverContent className="w-80 p-3">
              <ManagePanel orgSlug={orgSlug} slug={slug} github={github} />
            </PopoverContent>
          </Popover>
        )}
      </Badge>
    )
  }

  return (
    <div className="inline-flex items-center gap-1 rounded-md border border-border bg-background pr-1 text-xs font-medium text-muted-foreground">
      <a
        href={url}
        target="_blank"
        rel="noreferrer"
        className="inline-flex items-center gap-1.5 px-2.5 py-1 transition-colors hover:text-foreground"
      >
        <GithubIcon className="size-3.5" strokeWidth={1.75} />
        <span className="font-mono text-xs">
          {github.repoOwner}/{github.repoName}
        </span>
      </a>
      {canManage && (
        <Popover>
          <PopoverTrigger
            render={
              <button
                type="button"
                aria-label={m.github_chip_manage_connection_aria_label()}
                className={cn(
                  "grid size-5 place-items-center rounded transition-colors hover:bg-accent",
                  "data-[open]:bg-accent"
                )}
              >
                <ChevronDown
                  className={cn(
                    "size-3 transition-transform",
                    "group-data-[open]:rotate-180"
                  )}
                  strokeWidth={1.75}
                />
              </button>
            }
          />
          <PopoverContent className="w-80 p-3">
            <ManagePanel orgSlug={orgSlug} slug={slug} github={github} />
          </PopoverContent>
        </Popover>
      )}
    </div>
  )
}

function ConnectPanel({ orgSlug, slug }: { orgSlug: string; slug: string }) {
  const [query, setQuery] = useState("")
  const repos = useAtomValue(githubReposAtom(query))
  const pKey = projectKey(orgSlug, slug)
  const connect = useAtomSet(connectGithubAtom(pKey))
  const connectState = useAtomValue(connectGithubAtom(pKey))
  const busy = connectState.waiting
  const errorString = connectState.waiting
    ? null
    : Result.matchWithError(connectState, {
        onInitial: () => null,
        onSuccess: () => null,
        onError: (error) =>
          Match.value(error).pipe(
            Match.tag("GitHubTokenExpired", () =>
              m.github_chip_connect_token_expired_error()
            ),
            Match.tag("GitHubScopeInsufficient", () =>
              m.github_chip_connect_scope_insufficient_error()
            ),
            Match.tag("RepoGone", () => m.git_repo_gone_error()),
            Match.orElse(() => m.github_chip_connect_failed_error())
          ),
        onDefect: () => m.github_chip_connect_failed_error()
      })

  function pick(repo: GithubRepo) {
    connect({
      repoOwner: repo.owner,
      repoName: repo.name,
      defaultBaseBranch: null
    })
  }

  return (
    <div className="p-3">
      <div className="mb-2 flex items-center gap-2">
        <Search className="size-4 text-muted-foreground" strokeWidth={1.75} />
        <Input
          placeholder={m.github_chip_search_repos_placeholder()}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          autoFocus
          className="h-8"
        />
      </div>
      {errorString && (
        <p className="mb-2 text-xs text-destructive" role="alert">
          {errorString}
        </p>
      )}
      <ul className="max-h-64 overflow-y-auto">
        {Result.matchWithError(repos, {
          onInitial: () => (
            <li className="px-2 py-3 text-sm text-muted-foreground">
              {m.chrome_loading()}
            </li>
          ),
          onError: () => (
            <li className="px-2 py-3 text-sm text-destructive">
              {m.github_chip_load_repos_error()}
            </li>
          ),
          onDefect: () => (
            <li className="px-2 py-3 text-sm text-destructive">
              {m.github_chip_load_repos_error()}
            </li>
          ),
          onSuccess: ({ value }) => (
            <>
              {value.repos.length === 0 ? (
                <li className="px-2 py-3 text-sm text-muted-foreground">
                  {m.github_chip_no_repos()}
                </li>
              ) : (
                value.repos.map((repo) => {
                  const key = `${repo.owner}/${repo.name}`
                  return (
                    <li key={key}>
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => pick(repo)}
                        className="flex w-full items-center justify-between gap-3 rounded-md px-2 py-1.5 text-left text-sm transition-colors hover:bg-accent disabled:opacity-50"
                      >
                        <span className="min-w-0 flex-1 truncate font-mono">
                          {repo.owner}/{repo.name}
                        </span>
                        <span className="shrink-0 text-xs text-muted-foreground">
                          {repo.private
                            ? m.github_chip_repo_private()
                            : m.github_chip_repo_public()}
                        </span>
                      </button>
                    </li>
                  )
                })
              )}
            </>
          )
        })}
      </ul>
    </div>
  )
}

function ManagePanel({
  orgSlug,
  slug,
  github
}: {
  orgSlug: string
  slug: string
  github: GithubConnection
}) {
  const pKey = projectKey(orgSlug, slug)
  const [base, setBase] = useState(github.defaultBaseBranch ?? "")
  const connect = useAtomSet(connectGithubAtom(pKey), { mode: "promiseExit" })
  const connectState = useAtomValue(connectGithubAtom(pKey))
  const saving = connectState.waiting
  const disconnect = useAtomSet(disconnectGithubAtom(pKey))
  const [confirmDisconnect, setConfirmDisconnect] = useState(false)

  async function saveBase() {
    await connect({
      repoOwner: github.repoOwner,
      repoName: github.repoName,
      defaultBaseBranch: base.trim() || null
    })
  }

  return (
    <div className="space-y-3">
      <div>
        <label
          htmlFor="github-default-base"
          className="block text-xs font-medium text-muted-foreground"
        >
          {m.github_chip_default_base_branch_label()}
        </label>
        <div className="mt-1 flex gap-2">
          <Input
            id="github-default-base"
            placeholder="main"
            value={base}
            onChange={(e) => setBase(e.target.value)}
            className="h-8"
          />
          <Button
            type="button"
            size="sm"
            disabled={saving || base === (github.defaultBaseBranch ?? "")}
            onClick={() => void saveBase()}
          >
            {m.common_save_button()}
          </Button>
        </div>
        <p className="mt-1 text-xs text-muted-foreground">
          {m.github_chip_default_base_branch_hint()}
        </p>
      </div>
      <div className="border-t border-border pt-3">
        {!confirmDisconnect ? (
          <button
            type="button"
            onClick={() => setConfirmDisconnect(true)}
            className="text-xs text-destructive hover:underline"
          >
            {m.github_chip_disconnect_repo_button()}
          </button>
        ) : (
          <div className="flex items-center gap-2">
            <span className="text-xs text-muted-foreground">
              {m.github_chip_disconnect_confirm_prefix()}{" "}
              <span className="font-mono">
                {github.repoOwner}/{github.repoName}
              </span>
              {m.github_chip_disconnect_confirm_suffix()}
            </span>
            <Button
              type="button"
              size="sm"
              variant="primary"
              onClick={() => void disconnect()}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {m.github_chip_disconnect_button()}
            </Button>
            <Button
              type="button"
              size="sm"
              variant="ghost"
              onClick={() => setConfirmDisconnect(false)}
            >
              {m.common_cancel_button()}
            </Button>
          </div>
        )}
      </div>
    </div>
  )
}
