import type { GithubConnection } from "@pp/shared"
import { GitBranch } from "lucide-react"

import { Button } from "@/components/ui/button"
import { repoUrl } from "@/features/github/lib/branchUrl"
import { useProjectRoute } from "@/features/projects/hooks/useProject"
import { MetaRow } from "@/features/tickets/components/ticket-page/MetaRow"
import { m } from "@/paraglide/messages"

import { SectionLink } from "./SectionLink"

export function AboutRepositories({
  repos
}: Readonly<{ repos: ReadonlyArray<GithubConnection> }>) {
  const { orgSlug, slug } = useProjectRoute()
  if (repos.length === 0) return null
  return (
    <MetaRow
      inset="link"
      label={
        <SectionLink
          to="/orgs/$orgSlug/projects/$slug/settings/integrations"
          params={{ orgSlug, slug }}
          label={m.project_about_repositories_label()}
        />
      }
    >
      {repos.map((repo) => (
        <Button
          key={repo.repoId || `${repo.repoOwner}/${repo.repoName}`}
          variant="sidebar-link"
          size="sm"
          className="w-full"
          render={
            <a
              href={repoUrl(repo)}
              target="_blank"
              rel="noreferrer noopener"
              aria-label={`${repo.repoOwner}/${repo.repoName}`}
            />
          }
        >
          <span className="flex w-5 shrink-0">
            <GitBranch className="size-3.5" strokeWidth={1.75} />
          </span>
          <span className="min-w-0 truncate">
            <span className="text-muted-foreground">{repo.repoOwner}/</span>
            <span className="text-foreground">{repo.repoName}</span>
          </span>
        </Button>
      ))}
    </MetaRow>
  )
}
