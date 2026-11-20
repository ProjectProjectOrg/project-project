import { useAtomValue } from "@effect/atom-react"
import type { Member } from "@pp/shared"
import { CommandMenuItem, CommandMenuCheck } from "@pp/ui/command-menu"
import { UserCheck, UserMinus } from "@pp/ui/icons"
import { MemberAvatar } from "@pp/ui/member-avatar"
import * as Result from "effect/reactivity/AsyncResult"
import type { ReactNode } from "react"

import { currentUserId } from "@/features/auth/atoms/auth"
import { CommandFrame } from "@/features/command-menu/components/CommandFrame"
import type {
  SelectedTicket,
  TicketContext
} from "@/features/command-menu/lib/commandMenu"
import { project, projectRequest } from "@/features/projects/atoms/projects"
import { m } from "@/paraglide/messages"

import {
  StagedChanges,
  StagedRowCount,
  StagedToggle,
  StagedValue,
  useStagedToggles
} from "./StagedChanges"
import { useTicketMutation } from "./useTicketMutation"

const NO_MEMBERS: ReadonlyArray<Member> = []

const ASSIGN_ME = "assign-me"

export function TicketAssigneeCommands({
  ticket,
  selection,
  chip,
  onBack,
  onClose
}: Readonly<{
  ticket: TicketContext
  selection: ReadonlyArray<SelectedTicket>
  chip: ReactNode
  onBack: () => void
  onClose: () => void
}>) {
  const result = useAtomValue(
    project(projectRequest(ticket.orgSlug, ticket.slug))
  )
  const members = Result.isSuccess(result) ? result.value.members : NO_MEMBERS
  const viewerId = useAtomValue(currentUserId)
  const { current, update } = useTicketMutation(ticket, selection)
  const assigned = new Set(current?.assignees ?? [])
  const byId = new Map<string, Member>(
    members.map((member) => [member.id, member])
  )
  // Several tickets: toggles are staged, and Apply sends them all at once.
  const many = selection.length > 1
  const staged = useStagedToggles(selection.map((each) => each.assignees))
  const apply = () => {
    if (staged.changes.length === 0) return
    update({ assignees: { add: staged.add, remove: staged.remove } })
    onClose()
  }
  const viewer = viewerId === undefined ? undefined : byId.get(viewerId)
  const viewerAssigned =
    viewer !== undefined &&
    (many ? staged.checked(viewer.id) === true : assigned.has(viewer.id))
  const toggle = (id: string) => {
    if (many) {
      staged.toggle(id)
      return
    }
    if (current === null) return
    update({
      assignees: assigned.has(id) ? { remove: [id] } : { add: [id] }
    })
    onClose()
  }

  return (
    <CommandFrame
      chip={chip}
      placeholder={m.tickets_command_assign_placeholder()}
      onBack={onBack}
      onSubmit={many ? apply : undefined}
      footer={
        many ? (
          <StagedChanges
            hint={m.tickets_selection_toggle()}
            applyLabel={m.tickets_selection_apply({ count: staged.affected })}
            onApply={apply}
            lines={staged.changes.flatMap(({ value, on, count }) => {
              const member = byId.get(value)
              return member === undefined
                ? []
                : [
                    {
                      key: value,
                      count,
                      change: (
                        <StagedToggle on={on}>
                          <StagedValue
                            label={member.name || member.email}
                            icon={<MemberAvatar member={member} size={14} />}
                          />
                        </StagedToggle>
                      )
                    }
                  ]
            })}
          />
        ) : undefined
      }
      items={[
        ...(viewer === undefined || current === null
          ? []
          : [
              {
                value: ASSIGN_ME,
                label: viewerAssigned
                  ? m.tickets_command_unassign_me()
                  : m.tickets_command_assign_me(),
                keywords: ["me", "myself", "self"]
              }
            ]),
        ...members.map((member) => ({
          value: member.id,
          label: member.name || member.email
        }))
      ]}
      onSelect={(item) => {
        if (item.value === ASSIGN_ME) {
          if (viewer !== undefined) toggle(viewer.id)
          return
        }
        if (byId.has(item.value)) toggle(item.value)
      }}
      renderItem={(item) => {
        if (item.value === ASSIGN_ME) {
          const Icon = viewerAssigned ? UserMinus : UserCheck
          return (
            <CommandMenuItem value={item.value}>
              <Icon className="size-4 shrink-0" strokeWidth={1.75} />
              <span className="min-w-0 flex-1 truncate">{item.label}</span>
            </CommandMenuItem>
          )
        }
        const member = byId.get(item.value)
        if (member === undefined) return null
        return (
          <CommandMenuItem value={item.value}>
            <MemberAvatar member={member} size={18} />
            <span className="min-w-0 flex-1 truncate">{item.label}</span>
            {many && <StagedRowCount count={staged.held(member.id)} />}
            <CommandMenuCheck
              checked={
                many ? staged.checked(member.id) : assigned.has(item.value)
              }
              label={m.chrome_command_menu_selected()}
            />
          </CommandMenuItem>
        )
      }}
    />
  )
}
