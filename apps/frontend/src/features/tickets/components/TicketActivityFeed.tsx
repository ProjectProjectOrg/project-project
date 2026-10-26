import { useAtom, useAtomValue } from "@effect/atom-react"
import type {
  ActivityCause,
  ActivitySystemSource,
  GroupKind,
  Member,
  ProjectStatus,
  Tag,
  TicketActivityActor,
  TicketActivityChange,
  TicketActivityEntry,
  TicketId,
  TicketPriority,
  TicketType
} from "@pp/shared"
import * as DateTime from "effect/DateTime"
import * as AsyncResult from "effect/reactivity/AsyncResult"
import {
  Bot,
  GitBranch,
  GitMerge,
  GitPullRequest,
  GitPullRequestClosed,
  Import,
  Layers,
  Zap,
  type LucideIcon
} from "lucide-react"
import { useState, type ReactNode } from "react"

import { MemberAvatar } from "@/features/members/components/MemberAvatar"
import {
  statusesFor,
  statusesRequest
} from "@/features/projects/atoms/projectStatuses"
import {
  useProject,
  useProjectRoute
} from "@/features/projects/hooks/useProject"
import { tagsFor, tagsRequest } from "@/features/tags/atoms/tags"
import { TagChip } from "@/features/tags/components/TagChip"
import {
  olderActivityPages,
  ticketActivity,
  ticketActivityRequest
} from "@/features/tickets/atoms/ticketActivity"
import {
  activityItems,
  dayKey,
  groupActivity,
  type ActivityGroup,
  type ActivityItem
} from "@/features/tickets/lib/activityGroups"
import { formatEstimate } from "@/features/tickets/lib/estimateMeta"
import {
  PRIORITY_LABELS,
  PRIORITY_META
} from "@/features/tickets/lib/priorityMeta"
import {
  statusMetaFor,
  TYPE_LABELS,
  TYPE_META
} from "@/features/tickets/lib/ticketMeta"
import { formatRelative } from "@/lib/relativeTime"
import { cn } from "@/lib/utils"
import { m } from "@/paraglide/messages"
import { getLocale } from "@/paraglide/runtime"

const INITIAL_VISIBLE = 12

const SYSTEM_ICONS: Readonly<Record<ActivitySystemSource, LucideIcon>> = {
  github: GitBranch,
  automation: Bot,
  import: Import
}

const SYSTEM_NAMES: Readonly<Record<ActivitySystemSource, () => string>> = {
  github: () => m.tickets_activity_actor_github(),
  automation: () => m.tickets_activity_actor_automation(),
  import: () => m.tickets_activity_actor_import()
}

const CAUSES: Readonly<Record<ActivityCause, () => string>> = {
  status_removed: () => m.tickets_activity_cause_status_removed(),
  tag_deleted: () => m.tickets_activity_cause_tag_deleted(),
  member_removed: () => m.tickets_activity_cause_member_removed(),
  sprint_completed: () => m.tickets_activity_cause_sprint_completed(),
  group_deleted: () => m.tickets_activity_cause_group_deleted(),
  git_automation: () => m.tickets_activity_cause_git_automation()
}

const GROUP_ICONS: Readonly<Record<GroupKind, LucideIcon>> = {
  sprint: Zap,
  epic: Layers,
  milestone: Layers,
  other: Layers
}

type Lookups = Readonly<{
  members: ReadonlyArray<Member>
  statuses: ReadonlyArray<ProjectStatus>
  tags: ReadonlyArray<Tag>
}>

function Value({
  icon: Icon,
  iconClassName,
  iconColor,
  children
}: Readonly<{
  icon?: LucideIcon
  iconClassName?: string
  iconColor?: string | null
  children: ReactNode
}>) {
  return (
    <span className="inline-flex items-center gap-1 align-bottom whitespace-nowrap text-foreground">
      {Icon && (
        <Icon
          className={cn("size-3.5 shrink-0", iconClassName)}
          style={iconColor ? { color: iconColor } : undefined}
          strokeWidth={1.75}
        />
      )}
      {children}
    </span>
  )
}

function Literal({ children }: Readonly<{ children: ReactNode }>) {
  return <span className="font-mono text-[13px]">{children}</span>
}

function StatusValue({
  slug,
  statuses
}: Readonly<{ slug: string; statuses: ReadonlyArray<ProjectStatus> }>) {
  const meta = statusMetaFor(slug, statuses)
  return (
    <Value
      icon={meta.icon}
      iconClassName={meta.className}
      iconColor={meta.color}
    >
      {meta.label}
    </Value>
  )
}

function PriorityValue({ priority }: Readonly<{ priority: TicketPriority }>) {
  return (
    <Value
      icon={PRIORITY_META[priority].icon}
      iconClassName={PRIORITY_META[priority].className}
    >
      {PRIORITY_LABELS[priority]()}
    </Value>
  )
}

function TypeValue({ type }: Readonly<{ type: TicketType }>) {
  return <Value icon={TYPE_META[type].icon}>{TYPE_LABELS[type]()}</Value>
}

function People({
  ids,
  members
}: Readonly<{ ids: ReadonlyArray<string>; members: ReadonlyArray<Member> }>) {
  return (
    <span className="inline-flex flex-wrap items-center gap-x-2 align-bottom">
      {ids.map((id) => {
        const member = members.find((candidate) => candidate.id === id)
        return (
          <span
            key={id}
            className="inline-flex items-center gap-1 whitespace-nowrap text-foreground"
          >
            {member && <MemberAvatar member={member} size={16} />}
            {member?.name ||
              member?.email ||
              m.tickets_activity_actor_unknown()}
          </span>
        )
      })}
    </span>
  )
}

function Tags({
  names,
  tags
}: Readonly<{ names: ReadonlyArray<string>; tags: ReadonlyArray<Tag> }>) {
  return (
    <span className="inline-flex flex-wrap items-center gap-1 align-bottom">
      {names.map((name) => (
        <TagChip
          key={name}
          name={name}
          size="xs"
          color={tags.find((tag) => tag.name === name)?.color ?? null}
        />
      ))}
    </span>
  )
}

const fieldChange = (label: string, from: ReactNode, to: ReactNode) => (
  <>
    {label} {from}
    <span aria-hidden="true" className="mx-1">
      →
    </span>
    <span className="sr-only"> {m.tickets_activity_field_to()} </span>
    {to}
  </>
)

const verbWith = (verb: string, value: ReactNode) => (
  <>
    {verb} {value}
  </>
)

const changeLines = (
  change: TicketActivityChange,
  lookups: Lookups
): ReadonlyArray<ReactNode> => {
  switch (change.kind) {
    case "title_changed":
      return [
        verbWith(m.tickets_activity_title_changed(), <Value>{change.to}</Value>)
      ]
    case "status_changed":
      return [
        fieldChange(
          m.tickets_activity_field_status(),
          <StatusValue slug={change.from} statuses={lookups.statuses} />,
          <StatusValue slug={change.to} statuses={lookups.statuses} />
        )
      ]
    case "priority_changed":
      return [
        fieldChange(
          m.tickets_activity_field_priority(),
          <PriorityValue priority={change.from} />,
          <PriorityValue priority={change.to} />
        )
      ]
    case "type_changed":
      return [
        fieldChange(
          m.tickets_activity_field_type(),
          <TypeValue type={change.from} />,
          <TypeValue type={change.to} />
        )
      ]
    case "estimate_changed":
      return [
        fieldChange(
          m.tickets_activity_field_estimate(),
          <Value>
            {change.from === null
              ? m.tickets_filters_estimate_none()
              : formatEstimate(change.from)}
          </Value>,
          <Value>
            {change.to === null
              ? m.tickets_filters_estimate_none()
              : formatEstimate(change.to)}
          </Value>
        )
      ]
    case "assignees_changed":
      return [
        ...(change.added.length > 0
          ? [
              verbWith(
                m.tickets_activity_assignees_added(),
                <People ids={change.added} members={lookups.members} />
              )
            ]
          : []),
        ...(change.removed.length > 0
          ? [
              verbWith(
                m.tickets_activity_assignees_removed(),
                <People ids={change.removed} members={lookups.members} />
              )
            ]
          : [])
      ]
    case "tags_changed":
      return [
        ...(change.added.length > 0
          ? [
              verbWith(
                m.tickets_activity_tags_added(),
                <Tags names={change.added} tags={lookups.tags} />
              )
            ]
          : []),
        ...(change.removed.length > 0
          ? [
              verbWith(
                m.tickets_activity_tags_removed(),
                <Tags names={change.removed} tags={lookups.tags} />
              )
            ]
          : [])
      ]
    case "description_edited":
      return [m.tickets_activity_description_edited()]
    case "archived":
      return [
        change.reason === undefined ? (
          m.tickets_activity_archived()
        ) : (
          <>
            {m.tickets_activity_archived()}{" "}
            <span className="mt-1 block border-l-2 border-border pl-2.5 whitespace-pre-line text-foreground">
              {change.reason}
            </span>
          </>
        )
      ]
    case "unarchived":
      return [m.tickets_activity_unarchived()]
    case "split":
      return [
        verbWith(
          m.tickets_activity_split(),
          <Value>
            <Literal>{change.into.join(", ")}</Literal>
          </Value>
        )
      ]
    case "group_added":
      return [
        verbWith(
          m.tickets_activity_group_added(),
          <Value icon={GROUP_ICONS[change.groupKind]}>{change.name}</Value>
        )
      ]
    case "group_removed":
      return [
        verbWith(
          m.tickets_activity_group_removed(),
          <Value icon={GROUP_ICONS[change.groupKind]}>{change.name}</Value>
        )
      ]
    case "branch_linked":
      return [
        verbWith(
          m.tickets_activity_branch_linked(),
          <Value icon={GitBranch} iconClassName="text-muted-foreground">
            <Literal>{change.branch}</Literal>
          </Value>
        )
      ]
    case "branch_unlinked":
      return [
        verbWith(
          m.tickets_activity_branch_unlinked(),
          <Value icon={GitBranch} iconClassName="text-muted-foreground">
            <Literal>{change.branch}</Literal>
          </Value>
        )
      ]
    case "stack_branch_added":
      return [
        verbWith(
          m.tickets_activity_stack_branch_added(),
          <Value icon={Layers} iconClassName="text-muted-foreground">
            <Literal>{change.branch}</Literal>
          </Value>
        )
      ]
    case "stack_branch_removed":
      return [
        verbWith(
          m.tickets_activity_stack_branch_removed(),
          <Value icon={Layers} iconClassName="text-muted-foreground">
            <Literal>{change.branch}</Literal>
          </Value>
        )
      ]
    case "pr_opened":
      return [
        verbWith(
          m.tickets_activity_pr_opened(),
          <Value icon={GitPullRequest} iconClassName="text-state-info">
            <Literal>#{change.number}</Literal>
          </Value>
        )
      ]
    case "pr_merged":
      return [
        verbWith(
          m.tickets_activity_pr_merged(),
          <Value icon={GitMerge} iconClassName="text-state-merged">
            <Literal>#{change.number}</Literal>
          </Value>
        )
      ]
    case "pr_closed":
      return [
        verbWith(
          m.tickets_activity_pr_closed(),
          <Value
            icon={GitPullRequestClosed}
            iconClassName="text-muted-foreground"
          >
            <Literal>#{change.number}</Literal>
          </Value>
        )
      ]
  }
}

const withCause = (
  lines: ReadonlyArray<ReactNode>,
  cause: ActivityCause | null
): ReadonlyArray<ReactNode> => {
  if (cause === null) return lines
  const text = CAUSES[cause]()
  return lines.map((line) => (
    <>
      {line} {text}
    </>
  ))
}

const itemLines = (
  item: ActivityItem,
  lookups: Lookups
): ReadonlyArray<ReactNode> =>
  item.kind === "entry"
    ? entryLines(item.entry, lookups)
    : withCause(
        [
          fieldChange(
            m.tickets_activity_field_sprint(),
            <Value icon={GROUP_ICONS.sprint}>{item.from}</Value>,
            <Value icon={GROUP_ICONS.sprint}>{item.to}</Value>
          )
        ],
        item.cause
      )

const entryLines = (
  entry: TicketActivityEntry,
  lookups: Lookups
): ReadonlyArray<ReactNode> => {
  if (entry.kind === "created") {
    return [
      entry.splitFrom === null
        ? m.tickets_activity_created()
        : verbWith(
            m.tickets_activity_split_from(),
            <Value>
              <Literal>{entry.splitFrom}</Literal>
            </Value>
          )
    ]
  }
  return withCause(changeLines(entry.change, lookups), entry.cause)
}

function ActorMark({ actor }: Readonly<{ actor: TicketActivityActor | null }>) {
  if (actor !== null && actor.kind !== "system") {
    return <MemberAvatar member={actor.user} size={20} />
  }
  const Icon = actor === null ? null : SYSTEM_ICONS[actor.source]
  return (
    <span className="grid size-5 place-items-center rounded-full bg-muted text-muted-foreground">
      {Icon && <Icon className="size-3" strokeWidth={2} />}
    </span>
  )
}

function ActorName({ actor }: Readonly<{ actor: TicketActivityActor | null }>) {
  if (actor === null || actor.kind === "system") {
    return (
      <span className="font-medium text-foreground">
        {actor === null
          ? m.tickets_activity_actor_unknown()
          : SYSTEM_NAMES[actor.source]()}
      </span>
    )
  }
  const name = actor.user.name || actor.user.email
  if (actor.kind === "user") {
    return <span className="font-medium text-foreground">{name}</span>
  }
  return (
    <span className="font-medium text-foreground">
      {name}{" "}
      <span className="font-normal text-muted-foreground">
        {m.tickets_activity_actor_via({ client: actor.client.name })}
      </span>
    </span>
  )
}

const today = () => DateTime.toDate(DateTime.nowUnsafe())
const yesterday = () =>
  DateTime.toDate(DateTime.subtract(DateTime.nowUnsafe(), { days: 1 }))

const dayLabel = (day: Date): string => {
  const key = dayKey(day)
  if (key === dayKey(today())) return m.tickets_activity_today()
  if (key === dayKey(yesterday())) return m.tickets_activity_yesterday()
  return new Intl.DateTimeFormat(getLocale(), {
    month: "short",
    day: "numeric",
    year: day.getFullYear() === today().getFullYear() ? undefined : "numeric"
  }).format(day)
}

const groupTime = (group: ActivityGroup): string =>
  dayKey(group.at) === dayKey(today())
    ? formatRelative(group.at)
    : new Intl.DateTimeFormat(getLocale(), {
        hour: "2-digit",
        minute: "2-digit",
        hourCycle: "h23"
      }).format(group.at)

const RAIL =
  "before:absolute before:left-[9.5px] before:w-px before:bg-border before:content-['']"

function GroupRow({
  group,
  lookups,
  railFromNode,
  railToNode
}: Readonly<{
  group: ActivityGroup
  lookups: Lookups
  railFromNode: boolean
  railToNode: boolean
}>) {
  return (
    <li
      className={cn(
        "relative grid grid-cols-[20px_1fr] gap-x-3",
        RAIL,
        railFromNode ? "before:top-2.5" : "before:top-0",
        railToNode ? "before:h-2.5" : "pb-4 before:bottom-0"
      )}
    >
      <span className="relative z-10 grid h-5 place-items-center">
        <ActorMark actor={group.actor} />
      </span>
      <div className="flex items-center justify-between gap-3 text-sm leading-5">
        <ActorName actor={group.actor} />
        <time
          className="shrink-0 text-[13px] text-muted-foreground tabular-nums"
          dateTime={group.at.toISOString()}
          title={group.at.toLocaleString(getLocale(), {
            dateStyle: "medium",
            timeStyle: "short",
            hourCycle: "h23"
          })}
        >
          {groupTime(group)}
        </time>
      </div>
      <ul className="col-start-2 mt-1.5 flex flex-col gap-2">
        {activityItems(group.entries).flatMap((item) =>
          itemLines(item, lookups).map((line, index) => (
            <li
              key={`${item.key}-${index}`}
              className="text-sm leading-5 text-muted-foreground"
            >
              {line}
            </li>
          ))
        )}
      </ul>
    </li>
  )
}

export function TicketActivityFeed({
  ticketId
}: Readonly<{ ticketId: TicketId }>) {
  const { orgSlug, slug } = useProjectRoute()
  const req = ticketActivityRequest(orgSlug, slug, ticketId)
  const result = useAtomValue(ticketActivity(req))
  const [olderPages, setOlderPages] = useAtom(olderActivityPages(req))
  const statusesResult = useAtomValue(
    statusesFor(statusesRequest(orgSlug, slug))
  )
  const tagsResult = useAtomValue(tagsFor(tagsRequest(orgSlug, slug)))
  const project = useProject()
  const [showAll, setShowAll] = useState(false)

  if (AsyncResult.isFailure(result)) {
    return (
      <p className="text-sm text-destructive">
        {m.tickets_activity_load_failed()}
      </p>
    )
  }
  if (!AsyncResult.isSuccess(result)) return null

  const lookups: Lookups = {
    members: project.members,
    statuses: AsyncResult.isSuccess(statusesResult) ? statusesResult.value : [],
    tags: AsyncResult.isSuccess(tagsResult) ? tagsResult.value : []
  }
  const { items, hasOlder } = result.value
  const visible = showAll ? items : items.slice(0, INITIAL_VISIBLE)
  const canShowOlder = visible.length < items.length || hasOlder
  const days = groupActivity(visible)
  const lastGroup = days.at(-1)?.groups.at(-1)

  return (
    <div className="space-y-4">
      <ol>
        {days.flatMap((day, dayIndex) =>
          [
            <li
              key={day.key}
              className={cn(
                "relative pb-2.5 pl-8 text-[13px] leading-5 text-muted-foreground",
                dayIndex > 0 && cn("pt-3", RAIL, "before:inset-y-0")
              )}
            >
              {dayLabel(day.day)}
            </li>
          ].concat(
            day.groups.map((group, groupIndex) => (
              <GroupRow
                key={group.key}
                group={group}
                lookups={lookups}
                railFromNode={dayIndex === 0 && groupIndex === 0}
                railToNode={group === lastGroup}
              />
            ))
          )
        )}
      </ol>
      {canShowOlder && (
        <button
          type="button"
          disabled={result.waiting}
          onClick={() => {
            if (visible.length < items.length) setShowAll(true)
            else setOlderPages(olderPages + 1)
          }}
          className="ml-8 text-sm text-muted-foreground transition-colors hover:text-foreground disabled:opacity-70"
        >
          {m.tickets_activity_show_older()}
        </button>
      )}
    </div>
  )
}
