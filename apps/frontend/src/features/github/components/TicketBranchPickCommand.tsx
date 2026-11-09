import { RegistryContext, useAtomValue } from "@effect/atom-react"
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
import { projectRequest } from "@/features/projects/atoms/projects"
import type { TicketPageProps } from "@/features/tickets/components/command-pages/TicketFieldCommands"
import { m } from "@/paraglide/messages"

export function TicketBranchPickCommand({
  ticket,
  mode,
  context,
  chip,
  onBack,
  env
}: TicketPageProps & Readonly<{ mode: "link" | "stack" }>) {
  const registry = useContext(RegistryContext)
  const [query, setQuery] = useState("")
  const [debounced] = useDebouncedValue(query, { wait: 150 })
  const result = useAtomValue(
    branches(branchesRequest(ticket.orgSlug, ticket.slug, debounced))
  )
  const current = context.ticketDetail?.branch ?? null
  const items = Result.isSuccess(result)
    ? result.value.items.filter((branch) => branch.name !== current)
    : []
  return (
    <CommandFrame
      chip={chip}
      placeholder={
        mode === "link"
          ? m.tickets_command_link_branch_placeholder()
          : m.tickets_command_stack_branch_placeholder()
      }
      onBack={onBack}
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
          { name: item.value }
        )
        env.close()
      }}
    />
  )
}
