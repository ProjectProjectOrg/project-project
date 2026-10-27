import type {
  GroupKind,
  Member,
  ProjectStatus,
  Tag,
  TicketPriority,
  TicketType
} from "@pp/shared"
import {
  GitBranch,
  GitMerge,
  GitPullRequest,
  GitPullRequestClosed,
  Layers,
  Zap,
  type LucideIcon
} from "lucide-react"
import type { ReactNode } from "react"

import { MemberAvatar } from "@/features/members/components/MemberAvatar"
import { TagChip } from "@/features/tags/components/TagChip"
import type {
  ActivityLine,
  ActivityLineBody,
  ActivityLiteralIcon,
  ActivityValue
} from "@/features/tickets/lib/activityLines"
import {
  PRIORITY_LABELS,
  PRIORITY_META
} from "@/features/tickets/lib/priorityMeta"
import {
  statusMetaFor,
  TYPE_LABELS,
  TYPE_META
} from "@/features/tickets/lib/ticketMeta"
import { cn } from "@/lib/utils"
import { m } from "@/paraglide/messages"

const GROUP_ICONS: Readonly<Record<GroupKind, LucideIcon>> = {
  sprint: Zap,
  epic: Layers,
  milestone: Layers,
  other: Layers
}

export type ActivityLookups = Readonly<{
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

const LITERAL_ICONS: Readonly<
  Record<ActivityLiteralIcon, Readonly<{ icon: LucideIcon; className: string }>>
> = {
  branch: { icon: GitBranch, className: "text-muted-foreground" },
  stack: { icon: Layers, className: "text-muted-foreground" },
  pr_opened: { icon: GitPullRequest, className: "text-state-info" },
  pr_merged: { icon: GitMerge, className: "text-state-merged" },
  pr_closed: { icon: GitPullRequestClosed, className: "text-muted-foreground" }
}

function ActivityValueView({
  value,
  lookups
}: Readonly<{ value: ActivityValue; lookups: ActivityLookups }>) {
  switch (value.kind) {
    case "text":
      return <Value>{value.text}</Value>
    case "literal": {
      const icon = value.icon === null ? null : LITERAL_ICONS[value.icon]
      return (
        <Value icon={icon?.icon} iconClassName={icon?.className}>
          <Literal>{value.text}</Literal>
        </Value>
      )
    }
    case "status":
      return <StatusValue slug={value.slug} statuses={lookups.statuses} />
    case "priority":
      return <PriorityValue priority={value.priority} />
    case "type":
      return <TypeValue type={value.type} />
    case "group":
      return <Value icon={GROUP_ICONS[value.groupKind]}>{value.name}</Value>
    case "people":
      return <People ids={value.ids} members={lookups.members} />
  }
  return <Tags names={value.names} tags={lookups.tags} />
}

function ActivityLineBodyView({
  body,
  lookups
}: Readonly<{ body: ActivityLineBody; lookups: ActivityLookups }>) {
  switch (body.kind) {
    case "plain":
      return body.text
    case "verb":
      return (
        <>
          {body.verb} <ActivityValueView value={body.value} lookups={lookups} />
        </>
      )
    case "field":
      return (
        <>
          {body.label} <ActivityValueView value={body.from} lookups={lookups} />
          <span aria-hidden="true" className="mx-1">
            →
          </span>
          <span className="sr-only"> {m.tickets_activity_field_to()} </span>
          <ActivityValueView value={body.to} lookups={lookups} />
        </>
      )
  }
  return (
    <>
      {body.text}{" "}
      <span className="mt-1 block border-l-2 border-border pl-2.5 whitespace-pre-line text-foreground">
        {body.quote}
      </span>
    </>
  )
}

export function ActivityLineView({
  line,
  lookups
}: Readonly<{ line: ActivityLine; lookups: ActivityLookups }>) {
  const body = <ActivityLineBodyView body={line.body} lookups={lookups} />
  return line.cause === null ? (
    body
  ) : (
    <>
      {body} {line.cause}
    </>
  )
}
