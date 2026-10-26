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
import { ConnectMenu } from "@/features/github/components/ConnectMenu"
import { MenuNote } from "@/features/github/components/MenuNote"
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
  github
}: Readonly<{ github: GithubConnection | null }>) {
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
