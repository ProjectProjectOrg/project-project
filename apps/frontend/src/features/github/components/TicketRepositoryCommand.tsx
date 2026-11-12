import type { GithubConnection } from "@pp/shared"
import { GitBranch } from "lucide-react"
import type { ReactNode } from "react"

import { CommandFrame } from "@/features/command-menu/components/CommandFrame"
import { repoSlug } from "@/features/github/lib/repos"
import { m } from "@/paraglide/messages"

export function TicketRepositoryCommand({
  repos,
  chip,
  onBack,
  onPick
}: Readonly<{
  repos: ReadonlyArray<GithubConnection>
  chip: ReactNode
  onBack: () => void
  onPick: (repoId: string) => void
}>) {
  return (
    <CommandFrame
      chip={chip}
      onBack={onBack}
      placeholder={m.github_command_choose_repository()}
      description={m.github_command_repository_description()}
      items={repos.map((repo) => ({
        value: repo.repoId,
        label: repoSlug(repo),
        icon: GitBranch
      }))}
      onSelect={(item) => onPick(item.value)}
    />
  )
}
