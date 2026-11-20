import type {
  GroupKind,
  Member,
  ProjectStatus,
  Tag,
  TicketPriority,
  TypeDefinition,
  TypeKey
} from "@pp/shared"
import { Markdown } from "@pp/ui/editor/markdown"
import {
  GitBranch,
  GitMerge,
  GitPullRequest,
  GitPullRequestClosed,
  Layers,
  Zap,
  type IconType
} from "@pp/ui/icons"
import { cn } from "@pp/ui/lib/utils"
import { MemberAvatar } from "@pp/ui/member-avatar"
import {
  TimelineChange,
  TimelineLiteral,
  TimelineQuote,
  TimelineValue,
  TimelineValues
} from "@pp/ui/timeline"
import { Link } from "@tanstack/react-router"
import type { ReactNode } from "react"

import { useProjectRoute } from "@/features/projects/hooks/useProject"
import { TagChip } from "@/features/tags/components/TagChip"
import { TypeGlyph } from "@/features/tickets/components/TypeGlyph"
import {
  ActivityLineBody,
  ActivityValue,
  type ActivityLine,
  type ActivityLiteralIcon
} from "@/features/tickets/lib/activityLines"
import {
  PRIORITY_LABELS,
  PRIORITY_META
} from "@/features/tickets/lib/priorityMeta"
import { statusMetaFor } from "@/features/tickets/lib/ticketMeta"
import { resolveType, typeName } from "@/features/tickets/lib/ticketTypes"
import { m } from "@/paraglide/messages"

const GROUP_ICONS: Readonly<Record<GroupKind, IconType>> = {
  sprint: Zap,
  epic: Layers,
  milestone: Layers,
  other: Layers
}

export type ActivityLookups = Readonly<{
  members: ReadonlyArray<Member>
  statuses: ReadonlyArray<ProjectStatus>
  tags: ReadonlyArray<Tag>
  types: ReadonlyArray<TypeDefinition>
}>

function Value({
  icon: Icon,
  iconClassName,
  iconColor,
  children
}: Readonly<{
  icon?: IconType
  iconClassName?: string
  iconColor?: string | null
  children: ReactNode
}>) {
  return (
    <TimelineValue
      icon={
        Icon && (
          <Icon
            className={cn(iconClassName)}
            style={iconColor ? { color: iconColor } : undefined}
            strokeWidth={1.75}
          />
        )
      }
    >
      {children}
    </TimelineValue>
  )
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

function TypeValue({
  type,
  types
}: Readonly<{
  type: TypeKey | null
  types: ReadonlyArray<TypeDefinition>
}>) {
  const shown = resolveType(types, type)
  return (
    <TimelineValue
      icon={shown !== null && <TypeGlyph type={shown} className="size-3.5" />}
    >
      {typeName(shown)}
    </TimelineValue>
  )
}

function People({
  ids,
  members
}: Readonly<{ ids: ReadonlyArray<string>; members: ReadonlyArray<Member> }>) {
  return (
    <TimelineValues>
      {ids.map((id) => {
        const member = members.find((candidate) => candidate.id === id)
        return (
          <TimelineValue
            key={id}
            icon={member && <MemberAvatar member={member} size={16} />}
          >
            {member?.name ||
              member?.email ||
              m.tickets_activity_actor_unknown()}
          </TimelineValue>
        )
      })}
    </TimelineValues>
  )
}

function Tags({
  names,
  tags
}: Readonly<{ names: ReadonlyArray<string>; tags: ReadonlyArray<Tag> }>) {
  return (
    <TimelineValues className="gap-1">
      {names.map((name) => (
        <TagChip
          key={name}
          size="xs"
          color={tags.find((tag) => tag.name === name)?.color}
        >
          {name}
        </TagChip>
      ))}
    </TimelineValues>
  )
}

const LITERAL_ICONS: Readonly<
  Record<ActivityLiteralIcon, Readonly<{ icon: IconType; className: string }>>
> = {
  branch: { icon: GitBranch, className: "text-muted-foreground" },
  stack: { icon: Layers, className: "text-muted-foreground" },
  pr_opened: { icon: GitPullRequest, className: "text-state-info" },
  pr_merged: { icon: GitMerge, className: "text-state-merged" },
  pr_closed: { icon: GitPullRequestClosed, className: "text-muted-foreground" }
}

function TicketValue({ id }: Readonly<{ id: string }>) {
  const { orgSlug, slug } = useProjectRoute()
  return (
    <Link
      to="/orgs/$orgSlug/projects/$slug/tickets/$id"
      params={{ orgSlug, slug, id }}
      preload="intent"
      className="text-foreground underline-offset-2 transition-colors hover:underline"
    >
      <TimelineLiteral>{id}</TimelineLiteral>
    </Link>
  )
}

function ActivityValueView({
  value,
  lookups
}: Readonly<{ value: ActivityValue; lookups: ActivityLookups }>) {
  return ActivityValue.$match(value, {
    text: ({ text }) => <span className="text-foreground">{text}</span>,
    literal: ({ text, icon }) => {
      const shown = icon === null ? null : LITERAL_ICONS[icon]
      return (
        <Value icon={shown?.icon} iconClassName={shown?.className}>
          <TimelineLiteral>{text}</TimelineLiteral>
        </Value>
      )
    },
    status: ({ slug }) => (
      <StatusValue slug={slug} statuses={lookups.statuses} />
    ),
    priority: ({ priority }) => <PriorityValue priority={priority} />,
    type: ({ type }) => <TypeValue type={type} types={lookups.types} />,
    group: ({ groupKind, name }) => (
      <Value icon={GROUP_ICONS[groupKind]}>{name}</Value>
    ),
    people: ({ ids }) => <People ids={ids} members={lookups.members} />,
    tags: ({ names }) => <Tags names={names} tags={lookups.tags} />,
    ticket: ({ id }) => <TicketValue id={id} />
  })
}

function ActivityLineBodyView({
  body,
  lookups
}: Readonly<{ body: ActivityLineBody; lookups: ActivityLookups }>) {
  return ActivityLineBody.$match(body, {
    plain: ({ text }) => text,
    verb: ({ verb, value }) => (
      <>
        {verb} <ActivityValueView value={value} lookups={lookups} />
      </>
    ),
    field: ({ label, from, to }) => (
      <>
        {label}{" "}
        <TimelineChange
          from={<ActivityValueView value={from} lookups={lookups} />}
          to={<ActivityValueView value={to} lookups={lookups} />}
          toLabel={m.tickets_activity_field_to()}
        />
      </>
    ),
    quoted: ({ text, quote }) => (
      <>
        {text}{" "}
        <TimelineQuote>
          <Markdown size="compact" blocks="flat">
            {quote}
          </Markdown>
        </TimelineQuote>
      </>
    )
  })
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
