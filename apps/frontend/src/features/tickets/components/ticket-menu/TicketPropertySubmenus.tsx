import { useAtomSet, useAtomValue } from "@effect/atom-react"
import {
  TagName,
  TicketType,
  type Member,
  type UpdateTicketInput
} from "@pp/shared"
import * as Exit from "effect/Exit"
import * as Option from "effect/Option"
import * as Result from "effect/reactivity/AsyncResult"
import * as Schema from "effect/Schema"
import {
  CircleDot,
  Gauge,
  Plus,
  Shapes,
  SignalHigh,
  Tag,
  UserRound
} from "lucide-react"
import { useState } from "react"

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
import { commandMenuState } from "@/features/command-menu/atoms/commandMenu"
import { openCommandMenu } from "@/features/command-menu/lib/commandMenu"
import { MemberAvatar } from "@/features/members/components/MemberAvatar"
import {
  statusesFor,
  statusesRequest
} from "@/features/projects/atoms/projectStatuses"
import { useProjectRoute } from "@/features/projects/hooks/useProject"
import { boardStatusesFor } from "@/features/sprints/lib/boardUtils"
import { createTag, tagsFor, tagsRequest } from "@/features/tags/atoms/tags"
import { typeOptions } from "@/features/tickets/components/ticket-list/TypeField"
import { useEstimationMode } from "@/features/tickets/hooks/useEstimationMode"
import {
  PRIORITY_LABELS,
  PRIORITY_META,
  PRIORITY_ORDER
} from "@/features/tickets/lib/priorityMeta"
import { statusMetaFor } from "@/features/tickets/lib/ticketMeta"
import { useProjectActor } from "@/hooks/useActor"
import { cn } from "@/lib/utils"
import { m } from "@/paraglide/messages"

import type { TicketMenuTicket } from "./TicketMenu"

const decodeTagName = Schema.decodeUnknownOption(TagName)

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
  members,
  editable,
  canAssign,
  onPatch
}: Readonly<{
  ticket: TicketMenuTicket
  members: ReadonlyArray<Member>
  editable: boolean
  canAssign: boolean
  onPatch: (patch: UpdateTicketInput) => void
}>) {
  const { orgSlug, slug } = useProjectRoute()
  const statusesResult = useAtomValue(
    statusesFor(statusesRequest(orgSlug, slug))
  )
  const statuses = Result.isSuccess(statusesResult) ? statusesResult.value : []
  const estimation = useEstimationMode()
  const viewerId = useAtomValue(currentUserId)
  const setCommandMenu = useAtomSet(commandMenuState)
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
  const toggleAssignee = (memberId: string) =>
    onPatch({
      assignees: ticket.assignees.includes(memberId)
        ? ticket.assignees.filter((id) => id !== memberId)
        : [...ticket.assignees, memberId]
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
                value={ticket.status}
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
                value={ticket.priority}
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
                value={ticket.type}
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
              <DropdownMenuCheckboxItem
                label={m.tickets_assignee_unassigned()}
                closeOnClick={false}
                checked={ticket.assignees.length === 0}
                onCheckedChange={() => {
                  if (ticket.assignees.length > 0) onPatch({ assignees: [] })
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
                  onCheckedChange={() => toggleAssignee(member.id)}
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
          onClick={() =>
            setCommandMenu(
              openCommandMenu(
                { orgSlug, slug, ticketId: ticket.id },
                "ticketEstimate"
              )
            )
          }
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
  onPatch: (patch: UpdateTicketInput) => void
}>) {
  const { orgSlug, slug } = useProjectRoute()
  const req = tagsRequest(orgSlug, slug)
  const result = useAtomValue(tagsFor(req))
  const create = useAtomSet(createTag(req), { mode: "promiseExit" })
  const canCreate = useProjectActor().call("tags", "create")
  const [draft, setDraft] = useState("")
  const tags = Result.isSuccess(result) ? result.value : []
  const newName = Option.filter(
    decodeTagName(draft.trim()),
    (name) => canCreate && !tags.some((tag) => tag.name === name)
  )
  const toggle = (name: TagName) =>
    onPatch({
      tags: applied.includes(name)
        ? applied.filter((tag) => tag !== name)
        : [...applied, name]
    })
  const createAndApply = async (name: TagName) => {
    setDraft("")
    const exit = await create({ name })
    if (Exit.isSuccess(exit)) onPatch({ tags: [...applied, name] })
  }
  return (
    <DropdownMenuSub
      filterable={{
        value: draft,
        onValueChange: (next) => setDraft(next.toLowerCase())
      }}
      onOpenChange={(open) => {
        if (!open) setDraft("")
      }}
    >
      <DropdownMenuSubTrigger>
        <Tag className="size-4" strokeWidth={1.75} />
        {m.tickets_command_tags()}
      </DropdownMenuSubTrigger>
      <DropdownMenuSubContent className="w-56">
        <DropdownMenuInput
          placeholder={
            canCreate
              ? m.tags_search_or_create_placeholder()
              : m.tickets_command_tags_placeholder()
          }
          aria-label={m.tickets_command_tags_placeholder()}
        />
        <DropdownMenuList className="max-h-72 overflow-y-auto">
          {tags.map((tag) => (
            <DropdownMenuCheckboxItem
              key={tag.name}
              label={tag.name}
              closeOnClick={false}
              checked={applied.includes(tag.name)}
              onCheckedChange={() => toggle(tag.name)}
            >
              <span
                aria-hidden
                className="size-2 shrink-0 rounded-full"
                style={{ backgroundColor: tag.color }}
              />
              <span className="min-w-0 truncate">{tag.name}</span>
            </DropdownMenuCheckboxItem>
          ))}
          {Option.isSome(newName) && (
            <DropdownMenuItem
              label={newName.value}
              closeOnClick={false}
              onClick={() => void createAndApply(newName.value)}
              className="cursor-pointer"
            >
              <Plus className="size-4" strokeWidth={1.75} />
              {m.tags_create_button({ name: newName.value })}
            </DropdownMenuItem>
          )}
        </DropdownMenuList>
        <DropdownMenuEmpty>{m.tickets_command_tags_empty()}</DropdownMenuEmpty>
      </DropdownMenuSubContent>
    </DropdownMenuSub>
  )
}
