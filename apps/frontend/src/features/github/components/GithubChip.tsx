import type { GithubConnection } from "@pp/shared"
import { Link } from "@tanstack/react-router"
import {
  AlertTriangle,
  ChevronDown,
  ExternalLink,
  GitBranch as GithubIcon,
  Settings2
} from "lucide-react"

import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger
} from "@/components/ui/dropdown-menu"
import { MenuNote } from "@/components/ui/menu-note"
import { ConnectMenu } from "@/features/github/components/ConnectMenu"
import { useCanManageGithub } from "@/features/github/hooks/useCanManageGithub"
import { useGithubWarning } from "@/features/github/hooks/useGithubWarning"
import { repoUrl } from "@/features/github/lib/branchUrl"
import { useProjectRoute } from "@/features/projects/hooks/useProject"
import { cn } from "@/lib/utils"
import { m } from "@/paraglide/messages"

function RepoName({ owner, name }: Readonly<{ owner: string; name: string }>) {
  return (
    <span className="min-w-0 truncate">
      <span className="text-muted-foreground">{owner}/</span>
      <span className="text-foreground">{name}</span>
    </span>
  )
}

export function GithubChip({
  repos
}: Readonly<{ repos: ReadonlyArray<GithubConnection> }>) {
  const { orgSlug, slug } = useProjectRoute()
  const canManage = useCanManageGithub(orgSlug)
  const warning = useGithubWarning(orgSlug, slug)

  const github = repos[0]
  if (github === undefined) {
    return canManage ? <ConnectMenu /> : null
  }
  const more = repos.length - 1

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
            {more > 0 ? (
              <span className="shrink-0 text-muted-foreground tabular-nums">
                {m.github_chip_more_repos({ count: more })}
              </span>
            ) : null}
          </Button>
        }
      />
      <DropdownMenuContent
        align="end"
        sideOffset={6}
        className={more > 0 ? "w-72" : "w-60"}
      >
        {warning ? (
          <>
            <MenuNote tone="error">{warning}</MenuNote>
            <DropdownMenuSeparator />
          </>
        ) : null}
        {repos.map((repo) => (
          <DropdownMenuItem
            key={repo.repoId}
            render={
              <a href={repoUrl(repo)} target="_blank" rel="noreferrer">
                <ExternalLink />
                {more > 0 ? (
                  <RepoName owner={repo.repoOwner} name={repo.repoName} />
                ) : (
                  m.github_chip_open_on_github()
                )}
              </a>
            }
          />
        ))}
        {canManage ? (
          <DropdownMenuItem
            render={
              <Link
                to="/orgs/$orgSlug/projects/$slug/settings/integrations"
                params={{ orgSlug, slug }}
              >
                <Settings2 />
                {m.github_chip_repository_settings()}
              </Link>
            }
          />
        ) : null}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
