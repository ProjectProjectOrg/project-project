import { useAtomSet, useAtomValue } from "@effect/atom-react"
import {
  listEditBetween,
  TicketType,
  type Member,
  type TicketId
} from "@pp/shared"
import * as Result from "effect/reactivity/AsyncResult"
import {
  CircleDot,
  Gauge,
  Shapes,
  SignalHigh,
  Tag,
  UserRound
} from "lucide-react"

import {
  DropdownMenuCheckboxItem,
  DropdownMenuEmpty,
  DropdownMenuInput,
  DropdownMenuItem,
  DropdownMenuList,
  DropdownMenuRadioGroup,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger
} from "@/components/ui/dropdown-menu"
import { currentUserId } from "@/features/auth/atoms/auth"
import { MemberAvatar } from "@/features/members/components/MemberAvatar"
import {
  statusesFor,
  statusesRequest
} from "@/features/projects/atoms/projectStatuses"
import { useProjectRoute } from "@/features/projects/hooks/useProject"
import { boardStatusesFor } from "@/features/sprints/lib/boardUtils"
import { TagMenuBody } from "@/features/tags/components/TagMenuBody"
import { AssignMeItem } from "@/features/tickets/components/ticket-list/AssigneeField"
import { typeOptions } from "@/features/tickets/components/ticket-list/TypeField"
import { useEstimationMode } from "@/features/tickets/hooks/useEstimationMode"
import { useTicketTagMenu } from "@/features/tickets/hooks/useTicketTagMenu"
import { toggleAssignee } from "@/features/tickets/lib/assignees"
import {
  PRIORITY_LABELS,
  PRIORITY_META,
  PRIORITY_ORDER
} from "@/features/tickets/lib/priorityMeta"
import type { SharedTicketFields } from "@/features/tickets/lib/sharedTicketFields"
import { statusMetaFor } from "@/features/tickets/lib/ticketMeta"
import type { TicketEdit } from "@/features/tickets/lib/ticketPatch"
import { cn } from "@/lib/utils"
import { m } from "@/paraglide/messages"

import type { TicketMenuTicket } from "./TicketMenu"
import { useOpenTicketPage } from "./useOpenTicketPage"

const viewerFirst = (
  members: ReadonlyArray<Member>,
  viewerId: string | null | undefined
): ReadonlyArray<Member> => {
  const viewer = members.find((member) => member.id === viewerId)
  return viewer === undefined
    ? members
    : [viewer, ...members.filter((member) => member !== viewer)]
}

export function TicketPropertySubmenus({
  ticket,
  unassigned,
  members,
  editable,
  canAssign,
  onPatch
}: Readonly<{
  ticket: Pick<
    SharedTicketFields,
    "status" | "priority" | "type" | "tags" | "assignees"
  > &
    Readonly<{ id: TicketId }>
  unassigned: boolean
  members: ReadonlyArray<Member>
  editable: boolean
  canAssign: boolean
  onPatch: (patch: TicketEdit) => void
}>) {
  const { orgSlug, slug } = useProjectRoute()
  const statusesResult = useAtomValue(
    statusesFor(statusesRequest(orgSlug, slug))
  )
  const statuses = Result.isSuccess(statusesResult) ? statusesResult.value : []
  const estimation = useEstimationMode()
  const viewerId = useAtomValue(currentUserId)
  const openPage = useOpenTicketPage(ticket.id)
  const statusItems = boardStatusesFor(statuses).map((status) => {
    const meta = statusMetaFor(status, statuses)
    const Icon = meta.icon
    return {
      value: status,
      textValue: meta.label,
      closeOnClick: true,
      label: (
        <>
          <Icon
            className={cn("size-4", meta.className)}
            style={meta.color ? { color: meta.color } : undefined}
            strokeWidth={1.75}
          />
          {meta.label}
        </>
      )
    }
  })
  const priorityItems = PRIORITY_ORDER.map((priority) => {
    const { icon: Icon, className } = PRIORITY_META[priority]
    return {
      value: priority,
      textValue: PRIORITY_LABELS[priority](),
      closeOnClick: true,
      label: (
        <>
          <Icon className={cn("size-4", className)} strokeWidth={1.75} />
          {PRIORITY_LABELS[priority]()}
        </>
      )
    }
  })
  const typeItems = typeOptions(TicketType.literals).map((item) => ({
    ...item,
    closeOnClick: true
  }))
  const setAssignees = (assignees: ReadonlyArray<string>) =>
    onPatch({
      assignees:
        assignees.length === 0
          ? []
          : listEditBetween(ticket.assignees, assignees)
    })

  return (
    <>
      {editable && (
        <>
          <DropdownMenuSub>
            <DropdownMenuSubTrigger>
              <CircleDot className="size-4" strokeWidth={1.75} />
              {m.tickets_command_change_status()}
            </DropdownMenuSubTrigger>
            <DropdownMenuSubContent className="w-48">
              <DropdownMenuRadioGroup
                items={statusItems}
                value={ticket.status ?? null}
                onValueChange={(status) => onPatch({ status })}
              />
            </DropdownMenuSubContent>
          </DropdownMenuSub>
          <DropdownMenuSub>
            <DropdownMenuSubTrigger>
              <SignalHigh className="size-4" strokeWidth={1.75} />
              {m.tickets_command_set_priority()}
            </DropdownMenuSubTrigger>
            <DropdownMenuSubContent className="w-40">
              <DropdownMenuRadioGroup
                items={priorityItems}
                value={ticket.priority ?? null}
                onValueChange={(priority) => onPatch({ priority })}
              />
            </DropdownMenuSubContent>
          </DropdownMenuSub>
          <DropdownMenuSub>
            <DropdownMenuSubTrigger>
              <Shapes className="size-4" strokeWidth={1.75} />
              {m.tickets_command_change_type()}
            </DropdownMenuSubTrigger>
            <DropdownMenuSubContent className="w-40">
              <DropdownMenuRadioGroup
                items={typeItems}
                value={ticket.type ?? null}
                onValueChange={(type) => onPatch({ type })}
              />
            </DropdownMenuSubContent>
          </DropdownMenuSub>
          <TagsSubmenu tags={ticket.tags} onPatch={onPatch} />
        </>
      )}
      {canAssign && (
        <DropdownMenuSub filterable>
          <DropdownMenuSubTrigger>
            <UserRound className="size-4" strokeWidth={1.75} />
            {m.tickets_command_assign()}
          </DropdownMenuSubTrigger>
          <DropdownMenuSubContent className="w-56">
            <DropdownMenuInput
              placeholder={m.tickets_assignee_search_placeholder()}
              aria-label={m.tickets_assignee_search_placeholder()}
            />
            <DropdownMenuList className="max-h-72 overflow-y-auto">
              <AssignMeItem
                assignees={ticket.assignees}
                members={members}
                onChange={setAssignees}
              />
              <DropdownMenuCheckboxItem
                label={m.tickets_assignee_unassigned()}
                closeOnClick={false}
                checked={unassigned}
                onCheckedChange={() => {
                  if (!unassigned) onPatch({ assignees: [] })
                }}
              >
                <UserRound className="size-4" strokeWidth={1.75} />
                {m.tickets_assignee_unassigned()}
              </DropdownMenuCheckboxItem>
              {viewerFirst(members, viewerId).map((member) => (
                <DropdownMenuCheckboxItem
                  key={member.id}
                  label={
                    member.username
                      ? `${member.name} ${member.username}`
                      : member.name
                  }
                  closeOnClick={false}
                  checked={ticket.assignees.includes(member.id)}
                  onCheckedChange={() =>
                    setAssignees(toggleAssignee(ticket.assignees, member.id))
                  }
                >
                  <MemberAvatar member={member} size={20} />
                  <span className="min-w-0 truncate">{member.name}</span>
                </DropdownMenuCheckboxItem>
              ))}
            </DropdownMenuList>
            <DropdownMenuEmpty>
              {m.tickets_assignee_search_empty()}
            </DropdownMenuEmpty>
          </DropdownMenuSubContent>
        </DropdownMenuSub>
      )}
      {editable && estimation !== "off" && (
        <DropdownMenuItem
          onClick={() => openPage("ticketEstimate")}
          className="cursor-pointer"
        >
          <Gauge className="size-4" strokeWidth={1.75} />
          {m.tickets_command_set_estimate()}
        </DropdownMenuItem>
      )}
    </>
  )
}

function TagsSubmenu({
  tags: applied,
  onPatch
}: Readonly<{
  tags: TicketMenuTicket["tags"]
  onPatch: (patch: TicketEdit) => void
}>) {
  const menu = useTicketTagMenu(applied, onPatch)
  return (
    <DropdownMenuSub
      filterable={menu.filterable}
      onOpenChange={menu.onOpenChange}
    >
      <DropdownMenuSubTrigger>
        <Tag className="size-4" strokeWidth={1.75} />
        {m.tickets_command_tags()}
      </DropdownMenuSubTrigger>
      <DropdownMenuSubContent className="w-56">
        <TagMenuBody {...menu.body} />
      </DropdownMenuSubContent>
    </DropdownMenuSub>
  )
}
