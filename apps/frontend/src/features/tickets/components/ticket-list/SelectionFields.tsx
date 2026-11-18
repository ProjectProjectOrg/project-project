import { useAtomValue } from "@effect/atom-react"
import type { GroupId, Member, TagName, TicketId } from "@pp/shared"
import { Tag, User, Zap } from "@pp/ui/icons"
import { cn } from "@pp/ui/lib/utils"
import { AvatarStack, MemberAvatar } from "@pp/ui/member-avatar"
import { SelectionBarField, SelectionBarStack } from "@pp/ui/selection-bar"
import {
  SelectionBarPickMenu,
  SelectionBarToggleMenu
} from "@pp/ui/selection-bar-menu"
import * as Result from "effect/reactivity/AsyncResult"

import type { SelectedTicket } from "@/features/command-menu/lib/commandMenu"
import {
  statusesFor,
  statusesRequest
} from "@/features/projects/atoms/projectStatuses"
import { useProjectRoute } from "@/features/projects/hooks/useProject"
import {
  sprintList,
  sprintListRequest,
  sprintMembership
} from "@/features/sprints/atoms/sprintList"
import { eligibleSprints } from "@/features/sprints/components/SprintAssignMenu"
import { SprintStateIcon } from "@/features/sprints/components/SprintChip"
import { boardStatusesFor } from "@/features/sprints/lib/boardUtils"
import { sprintSummary } from "@/features/sprints/lib/sprintSummary"
import { tagsFor, tagsRequest } from "@/features/tags/atoms/tags"
import {
  PRIORITY_LABELS,
  PRIORITY_META,
  PRIORITY_ORDER
} from "@/features/tickets/lib/priorityMeta"
import { statusMetaFor } from "@/features/tickets/lib/ticketMeta"
import type { TicketEdit } from "@/features/tickets/lib/ticketPatch"
import { m } from "@/paraglide/messages"

/*
 * The selection bar's fields: each reads what the selected tickets share,
 * or (muted) how many values they hold, with every value's icon side by
 * side. Each opens a menu that says how many of the selection have each
 * value; picks are staged there and Apply sends them to every ticket.
 */

const countBy = <V,>(values: ReadonlyArray<V>) => {
  const counts = new Map<V, number>()
  for (const value of values) counts.set(value, (counts.get(value) ?? 0) + 1)
  return counts
}

// What a person is called in the menu: their name, or (when they never
// set one) their username or email.
const nameOf = (member: Member) =>
  [member.name, member.username, member.email].find(
    (each) => each !== null && each !== ""
  ) ?? member.email

const applyTo = (count: number) => m.tickets_selection_apply({ count })

type FieldProps<V> = Readonly<{
  tickets: ReadonlyArray<SelectedTicket>
  shared: V | null
  onEdit: (edit: TicketEdit) => void
}>

export function StatusField({
  tickets,
  shared,
  onEdit
}: FieldProps<SelectedTicket["status"]>) {
  const { orgSlug, slug } = useProjectRoute()
  const result = useAtomValue(statusesFor(statusesRequest(orgSlug, slug)))
  const statuses = Result.isSuccess(result) ? result.value : []
  const counts = countBy(tickets.map((ticket) => ticket.status))
  // In the project's own order, then any it doesn't list.
  const order = [
    ...boardStatusesFor(statuses),
    ...[...counts.keys()].filter(
      (status) => !boardStatusesFor(statuses).includes(status)
    )
  ]
  const held = order.filter((status) => counts.has(status))
  const meta = shared === null ? null : statusMetaFor(shared, statuses)
  const iconOf = (status: string) => {
    const each = statusMetaFor(status, statuses)
    return (
      <each.icon
        key={status}
        className={each.className}
        style={each.color ? { color: each.color } : undefined}
        strokeWidth={1.75}
      />
    )
  }
  return (
    <SelectionBarPickMenu
      total={tickets.length}
      applyLabel={applyTo(tickets.length)}
      options={order.map((status) => ({
        value: status,
        textValue: statusMetaFor(status, statuses).label,
        icon: iconOf(status),
        count: counts.get(status) ?? 0
      }))}
      onApply={(status) => onEdit({ status })}
      trigger={
        <SelectionBarField
          name={m.tickets_selection_field_status()}
          icon={<SelectionBarStack>{held.map(iconOf)}</SelectionBarStack>}
          value={
            meta
              ? meta.label
              : m.tickets_selection_statuses({ count: held.length })
          }
          mixed={meta === null}
        />
      }
    />
  )
}

export function PriorityField({
  tickets,
  shared,
  onEdit
}: FieldProps<SelectedTicket["priority"]>) {
  const counts = countBy(tickets.map((ticket) => ticket.priority))
  const held = PRIORITY_ORDER.filter((priority) => counts.has(priority))
  const iconOf = (priority: (typeof PRIORITY_ORDER)[number]) => {
    const each = PRIORITY_META[priority]
    return (
      <each.icon key={priority} className={each.className} strokeWidth={1.75} />
    )
  }
  return (
    <SelectionBarPickMenu
      total={tickets.length}
      applyLabel={applyTo(tickets.length)}
      options={PRIORITY_ORDER.map((priority) => ({
        value: priority,
        textValue: PRIORITY_LABELS[priority](),
        icon: iconOf(priority),
        count: counts.get(priority) ?? 0
      }))}
      onApply={(priority) => onEdit({ priority })}
      trigger={
        <SelectionBarField
          name={m.tickets_selection_field_priority()}
          icon={<SelectionBarStack>{held.map(iconOf)}</SelectionBarStack>}
          value={
            shared === null
              ? m.tickets_selection_priorities({ count: held.length })
              : PRIORITY_LABELS[shared]()
          }
          mixed={shared === null}
        />
      }
    />
  )
}

export function AssigneeField({
  tickets,
  common,
  members,
  onEdit
}: Readonly<{
  tickets: ReadonlyArray<SelectedTicket>
  common: ReadonlyArray<string>
  members: ReadonlyArray<Member>
  onEdit: (edit: TicketEdit) => void
}>) {
  const lists = tickets.map((ticket) => ticket.assignees)
  const counts = countBy(lists.flat())
  const faces = members.filter((member) => counts.has(member.id))
  const nobody = lists.some((list) => list.length === 0)
  // Every ticket has the same people: all of them on each, or (all
  // unassigned) nobody on any.
  const same = nobody
    ? counts.size === 0
    : [...counts.values()].every((count) => count === tickets.length)
  const only =
    same && common.length === 1
      ? members.find((member) => member.id === common[0])
      : undefined
  // Mixed, "unassigned" counts as one of the values, as the faces show it.
  const value = !same
    ? m.tickets_selection_assignees({
        count: faces.length + (nobody ? 1 : 0)
      })
    : common.length === 0
      ? m.tickets_assignee_unassigned()
      : only === undefined
        ? m.tickets_selection_assignees({ count: common.length })
        : nameOf(only)
  return (
    <SelectionBarToggleMenu
      total={tickets.length}
      applyLabel={applyTo(tickets.length)}
      search={{
        placeholder: m.tickets_assignee_search_placeholder(),
        empty: m.tickets_assignee_search_empty()
      }}
      options={members.map((member) => ({
        value: member.id,
        textValue: nameOf(member),
        icon: <MemberAvatar member={member} size={16} />,
        count: counts.get(member.id) ?? 0
      }))}
      onApply={({ add, remove }) => onEdit({ assignees: { add, remove } })}
      trigger={
        <SelectionBarField
          name={m.tickets_selection_field_assignee()}
          icon={
            <SelectionBarStack>
              {faces.length > 0 && (
                <AvatarStack
                  key="people"
                  subjects={faces}
                  size={16}
                  max={3}
                  overlap={4}
                  animated
                  countTooltip={false}
                />
              )}
              {nobody && (
                <User
                  key="nobody"
                  className={cn(faces.length > 0 && "text-muted-foreground")}
                  strokeWidth={1.75}
                />
              )}
            </SelectionBarStack>
          }
          value={value}
          mixed={!same}
        />
      }
    />
  )
}

const NO_SPRINT = "none"

export function SprintField({
  orgSlug,
  slug,
  tickets,
  onSprint
}: Readonly<{
  orgSlug: string
  slug: string
  tickets: ReadonlyArray<SelectedTicket>
  // The new sprint, and each ticket's sprint before it (for undo).
  onSprint: (
    sprint: GroupId | null,
    before: ReadonlyMap<TicketId, GroupId | null>
  ) => void
}>) {
  const req = sprintListRequest(orgSlug, slug)
  const list = useAtomValue(sprintList(req))
  const membership = useAtomValue(sprintMembership(req))
  const sprints = Result.isSuccess(list) ? list.value : []
  const byTicket = Result.isSuccess(membership) ? membership.value : null
  if (byTicket === null || sprints.length === 0) return null
  const of = tickets.map((ticket) => byTicket.get(ticket.id)?.id ?? null)
  const before = new Map(
    tickets.map((ticket, at) => [ticket.id, of[at] ?? null])
  )
  const counts = countBy(of)
  // Open sprints, plus any finished one the selection is still in.
  const offered = [
    ...eligibleSprints(sprints),
    ...sprints.filter(
      (sprint) =>
        counts.has(sprint.id) &&
        !eligibleSprints(sprints).some((each) => each.id === sprint.id)
    )
  ]
  const shared = counts.size === 1 ? (of[0] ?? null) : undefined
  const current = sprints.find((sprint) => sprint.id === shared) ?? null
  // Every sprint the selection is in, oldest first: "Sprint 24, 25",
  // and "none" when some tickets aren't in one.
  const named = sprints
    .filter((sprint) => counts.has(sprint.id))
    .toSorted(
      (a, b) => (a.startsAt?.getTime() ?? 0) - (b.startsAt?.getTime() ?? 0)
    )
  const names = sprintSummary(named.map((sprint) => sprint.name))
  const value =
    current !== null
      ? current.name
      : named.length === 0
        ? m.tickets_selection_no_sprint()
        : counts.has(null)
          ? m.tickets_selection_sprints_and_none({ sprints: names })
          : names
  return (
    <SelectionBarPickMenu<string>
      total={tickets.length}
      applyLabel={applyTo(tickets.length)}
      options={[
        ...offered.map((sprint) => ({
          value: sprint.id,
          textValue: sprint.name,
          icon: <SprintStateIcon sprint={sprint} size="xs" />,
          count: counts.get(sprint.id) ?? 0
        })),
        {
          value: NO_SPRINT,
          textValue: m.tickets_selection_no_sprint(),
          icon: <Zap strokeWidth={1.75} />,
          count: counts.get(null) ?? 0
        }
      ]}
      onApply={(id) =>
        onSprint(
          id === NO_SPRINT
            ? null
            : (offered.find((sprint) => sprint.id === id)?.id ?? null),
          before
        )
      }
      trigger={
        <SelectionBarField
          name={m.tickets_selection_field_sprint()}
          icon={
            <SelectionBarStack>
              {current ? (
                <SprintStateIcon key={current.id} sprint={current} />
              ) : (
                <Zap key="sprints" strokeWidth={1.75} />
              )}
            </SelectionBarStack>
          }
          value={value}
          mixed={shared === undefined}
        />
      }
    />
  )
}

export function LabelsField({
  tickets,
  common,
  onEdit
}: Readonly<{
  tickets: ReadonlyArray<SelectedTicket>
  common: ReadonlyArray<string>
  onEdit: (edit: TicketEdit) => void
}>) {
  const { orgSlug, slug } = useProjectRoute()
  const result = useAtomValue(tagsFor(tagsRequest(orgSlug, slug)))
  const tags = Result.isSuccess(result) ? result.value : []
  const counts = countBy(tickets.flatMap((ticket) => ticket.tags))
  const held = tags.filter((tag) => counts.has(tag.name))
  const same = held.every((tag) => counts.get(tag.name) === tickets.length)
  const value = !same
    ? m.tickets_selection_labels({ count: held.length })
    : common.length === 0
      ? m.tickets_selection_no_labels()
      : common.join(", ")
  return (
    <SelectionBarToggleMenu<TagName>
      total={tickets.length}
      applyLabel={applyTo(tickets.length)}
      search={{
        placeholder: m.tickets_filters_tags_search_placeholder(),
        empty: m.tickets_command_tags_empty()
      }}
      options={tags.map((tag) => ({
        value: tag.name,
        textValue: tag.name,
        icon: (
          <span
            aria-hidden
            className="size-2 shrink-0 rounded-full"
            style={{ backgroundColor: tag.color }}
          />
        ),
        count: counts.get(tag.name) ?? 0
      }))}
      onApply={({ add, remove }) => onEdit({ tags: { add, remove } })}
      trigger={
        <SelectionBarField
          name={m.tickets_selection_field_labels()}
          icon={
            <SelectionBarStack>
              {held.length === 0 ? (
                <Tag key="none" strokeWidth={1.75} />
              ) : (
                held.map((tag) => (
                  <span
                    key={tag.name}
                    className="size-2 rounded-full"
                    style={{ backgroundColor: tag.color }}
                  />
                ))
              )}
            </SelectionBarStack>
          }
          value={value}
          mixed={!same}
        />
      }
    />
  )
}
