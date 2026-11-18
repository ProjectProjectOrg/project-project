import type { GithubConnection } from "@pp/shared"
import { Button } from "@pp/ui/button"
import { GitBranch } from "@pp/ui/icons"

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
          to="/settings/orgs/$orgSlug/projects/$slug/integrations"
          params={{ orgSlug, slug }}
          label={m.project_about_repositories_label()}
        />
      }
    >
      {repos.map((repo) => (
        <Button
          key={repo.repoId || `${repo.repoOwner}/${repo.repoName}`}
          variant="ghost"
          size="sm"
          className="w-full justify-start gap-2 px-1.5"
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
