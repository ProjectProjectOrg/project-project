import { RegistryContext, useAtomValue } from "@effect/atom-react"
import * as Result from "effect/reactivity/AsyncResult"
import { GitBranchPlus, Link2 } from "lucide-react"
import { useContext, useState } from "react"

import { fireMutation } from "@/api/viewMutation"
import { me } from "@/features/auth/atoms/auth"
import { CommandFrame } from "@/features/command-menu/components/CommandFrame"
import { branchAttempt, createBranch } from "@/features/github/atoms/github"
import {
  defaultBranchName,
  sanitizeBranchName
} from "@/features/github/lib/branchPicker"
import { projectRequest } from "@/features/projects/atoms/projects"
import type { TicketPageProps } from "@/features/tickets/components/command-pages/TicketFieldCommands"
import { m } from "@/paraglide/messages"

const CONNECT = "connect"

export function TicketBranchCommand({
  ticket,
  context,
  chip,
  onBack,
  env
}: TicketPageProps) {
  const registry = useContext(RegistryContext)
  const viewer = useAtomValue(me())
  const [query, setQuery] = useState("")
  const detail = context.ticketDetail
  const github = context.project?.github ?? null
  if (detail === null || github === null) return null
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
          { name, baseBranch: base }
        )
      }}
    />
  )
}
