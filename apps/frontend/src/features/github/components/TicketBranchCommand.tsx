import { RegistryContext, useAtomValue } from "@effect/atom-react"
import type { GithubConnection } from "@pp/shared"
import * as Result from "effect/reactivity/AsyncResult"
import { GitBranchPlus, Link2 } from "lucide-react"
import { useContext, useState } from "react"

import { fireMutation } from "@/api/viewMutation"
import { me } from "@/features/auth/atoms/auth"
import { CommandFrame } from "@/features/command-menu/components/CommandFrame"
import { branchAttempt, createBranch } from "@/features/github/atoms/github"
import { TicketRepositoryCommand } from "@/features/github/components/TicketRepositoryCommand"
import {
  defaultBranchName,
  sanitizeBranchName
} from "@/features/github/lib/branchPicker"
import { connectedRepos, repoSlug } from "@/features/github/lib/repos"
import { projectRequest } from "@/features/projects/atoms/projects"
import type { TicketPageProps } from "@/features/tickets/components/command-pages/TicketFieldCommands"
import { m } from "@/paraglide/messages"

const CONNECT = "connect"

export function TicketBranchCommand(props: TicketPageProps) {
  const [repoId, setRepoId] = useState<string | null>(null)
  const project = props.context.project
  if (
    project === null ||
    props.context.projectActor?.call("tickets", "createBranch") !== true
  )
    return null
  const repos = connectedRepos(project)
  const github =
    repos.length === 1 ? repos[0] : repos.find((repo) => repo.repoId === repoId)
  if (github === undefined)
    return (
      <TicketRepositoryCommand
        repos={repos}
        chip={props.chip}
        onBack={props.onBack}
        onPick={setRepoId}
      />
    )
  return (
    <CreateTicketBranch
      key={github.repoId}
      {...props}
      github={github}
      onBack={repos.length > 1 ? () => setRepoId(null) : props.onBack}
    />
  )
}

function CreateTicketBranch({
  ticket,
  context,
  chip,
  onBack,
  env,
  github
}: TicketPageProps & Readonly<{ github: GithubConnection }>) {
  const registry = useContext(RegistryContext)
  const viewer = useAtomValue(me())
  const [query, setQuery] = useState("")
  const detail = context.ticketDetail
  if (detail === null) return null
  const connected =
    Result.isSuccess(viewer) && viewer.value.personalGithub.connected
  const name =
    sanitizeBranchName(query) ||
    defaultBranchName(null, detail.type, detail.id, detail.title)
  const base = github.defaultBaseBranch ?? "main"
  return (
    <CommandFrame
      chip={chip}
      placeholder={m.tickets_command_branch_placeholder()}
      onBack={onBack}
      description={m.github_command_branch_repository({
        repo: repoSlug(github)
      })}
      filter={false}
      onSearchChange={setQuery}
      items={
        connected
          ? [
              {
                value: name,
                label: m.tickets_command_branch_create({ name, base }),
                icon: GitBranchPlus
              }
            ]
          : [
              {
                value: CONNECT,
                label: m.git_branch_picker_connect_github(),
                icon: Link2
              }
            ]
      }
      onSelect={(item) => {
        env.close()
        if (item.value === CONNECT) {
          env.navigate("/profile/connections")
          return
        }
        registry.set(branchAttempt(detail.id), { action: "create", name })
        void fireMutation(
          registry,
          createBranch({
            req: projectRequest(ticket.orgSlug, ticket.slug),
            id: detail.id
          }),
          { name, baseBranch: base, repoId: github.repoId }
        )
      }}
    />
  )
}
