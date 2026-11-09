import { useAtomValue } from "@effect/atom-react"
import type { Member } from "@pp/shared"
import * as Result from "effect/reactivity/AsyncResult"
import type { ReactNode } from "react"

import { CommandMenuItem, CommandMenuCheck } from "@/components/ui/command-menu"
import { CommandFrame } from "@/features/command-menu/components/CommandFrame"
import type { TicketContext } from "@/features/command-menu/lib/commandMenu"
import { MemberAvatar } from "@/features/members/components/MemberAvatar"
import { project, projectRequest } from "@/features/projects/atoms/projects"
import { m } from "@/paraglide/messages"

import { useTicketMutation } from "./useTicketMutation"

const NO_MEMBERS: ReadonlyArray<Member> = []

export function TicketAssigneeCommands({
  ticket,
  chip,
  onBack,
  onClose
}: Readonly<{
  ticket: TicketContext
  chip: ReactNode
  onBack: () => void
  onClose: () => void
}>) {
  const result = useAtomValue(
    project(projectRequest(ticket.orgSlug, ticket.slug))
  )
  const members = Result.isSuccess(result) ? result.value.members : NO_MEMBERS
  const { current, update } = useTicketMutation(ticket)
  const assigned = new Set(current?.assignees ?? [])
  const byId = new Map<string, Member>(
    members.map((member) => [member.id, member])
  )

  return (
    <CommandFrame
      chip={chip}
      placeholder={m.tickets_command_assign_placeholder()}
      onBack={onBack}
      items={members.map((member) => ({
        value: member.id,
        label: member.name || member.email
      }))}
      onSelect={(item) => {
        const member = byId.get(item.value)
        if (current === null || member === undefined) return
        update({
          assignees: assigned.has(member.id)
            ? current.assignees.filter((id) => id !== member.id)
            : [...current.assignees, member.id]
        })
        onClose()
      }}
      renderItem={(item) => {
        const member = byId.get(item.value)
        if (member === undefined) return null
        return (
          <CommandMenuItem value={item.value}>
            <MemberAvatar member={member} size={18} />
            <span className="min-w-0 flex-1 truncate">{item.label}</span>
            {assigned.has(item.value) && <CommandMenuCheck />}
          </CommandMenuItem>
        )
      }}
    />
  )
}
