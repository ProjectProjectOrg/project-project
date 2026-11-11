import { RegistryContext, useAtomValue } from "@effect/atom-react"
import type { GithubConnection } from "@pp/shared"
import { useDebouncedValue } from "@tanstack/react-pacer"
import * as Result from "effect/reactivity/AsyncResult"
import { GitBranch } from "lucide-react"
import { useContext, useState } from "react"

import { fireMutation } from "@/api/viewMutation"
import { CommandFrame } from "@/features/command-menu/components/CommandFrame"
import {
  attachBranch,
  branches,
  branchesRequest,
  stackBranch
} from "@/features/github/atoms/github"
import { TicketRepositoryCommand } from "@/features/github/components/TicketRepositoryCommand"
import {
  connectedRepos,
  repoSlug,
  ticketRepo
} from "@/features/github/lib/repos"
import { projectRequest } from "@/features/projects/atoms/projects"
import type { TicketPageProps } from "@/features/tickets/components/command-pages/TicketFieldCommands"
import { useSettledValue } from "@/hooks/useSettledValue"
import { m } from "@/paraglide/messages"

type BranchPickProps = TicketPageProps & Readonly<{ mode: "link" | "stack" }>

export function TicketBranchPickCommand(props: BranchPickProps) {
  const [repoId, setRepoId] = useState<string | null>(null)
  const project = props.context.project
  if (
    project === null ||
    props.context.projectActor?.call(
      "tickets",
      props.mode === "link" ? "attachBranch" : "stackBranch"
    ) !== true
  )
    return null
  const repos = connectedRepos(project)
  const github =
    props.mode === "stack"
      ? ticketRepo(project, props.context.ticketDetail?.repoId)
      : repos.length === 1
        ? repos[0]
        : repos.find((repo) => repo.repoId === repoId)
  if (github == null)
    return (
      <TicketRepositoryCommand
        repos={repos}
        chip={props.chip}
        onBack={props.onBack}
        onPick={setRepoId}
      />
    )
  return (
    <PickBranch
      key={github.repoId}
      {...props}
      github={github}
      onBack={
        props.mode === "link" && repos.length > 1
          ? () => setRepoId(null)
          : props.onBack
      }
    />
  )
}

function PickBranch({
  ticket,
  mode,
  context,
  chip,
  onBack,
  env,
  github
}: BranchPickProps & Readonly<{ github: GithubConnection }>) {
  const registry = useContext(RegistryContext)
  const [query, setQuery] = useState("")
  const [debounced] = useDebouncedValue(query, { wait: 150 })
  const result = useAtomValue(
    branches(
      branchesRequest(ticket.orgSlug, ticket.slug, debounced, github.repoId)
    )
  )
  const current = context.ticketDetail?.branch ?? null
  const items =
    useSettledValue(result, null)?.items.filter(
      (branch) => branch.name !== current
    ) ?? []
  return (
    <CommandFrame
      fixedHeight
      chip={chip}
      placeholder={
        mode === "link"
          ? m.tickets_command_link_branch_placeholder()
          : m.tickets_command_stack_branch_placeholder()
      }
      onBack={onBack}
      description={m.github_command_branch_repository({
        repo: repoSlug(github)
      })}
      notice={
        Result.isFailure(result)
          ? m.git_load_branches_error()
          : Result.isInitial(result)
            ? m.git_branches_loading()
            : null
      }
      filter={false}
      onSearchChange={setQuery}
      items={items.map((branch) => ({
        value: branch.name,
        label: branch.name,
        icon: GitBranch
      }))}
      onSelect={(item) => {
        const request = {
          req: projectRequest(ticket.orgSlug, ticket.slug),
          id: ticket.ticketId
        }
        void fireMutation(
          registry,
          mode === "link" ? attachBranch(request) : stackBranch(request),
          mode === "link"
            ? { name: item.value, repoId: github.repoId }
            : { name: item.value }
        )
        env.close()
      }}
    />
  )
}
