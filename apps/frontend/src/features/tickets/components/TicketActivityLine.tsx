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
          name={name}
          size="xs"
          color={tags.find((tag) => tag.name === name)?.color ?? null}
        />
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
  switch (value.kind) {
    case "text":
      return <span className="text-foreground">{value.text}</span>
    case "literal": {
      const icon = value.icon === null ? null : LITERAL_ICONS[value.icon]
      return (
        <Value icon={icon?.icon} iconClassName={icon?.className}>
          <TimelineLiteral>{value.text}</TimelineLiteral>
        </Value>
      )
    }
    case "status":
      return <StatusValue slug={value.slug} statuses={lookups.statuses} />
    case "priority":
      return <PriorityValue priority={value.priority} />
    case "type":
      return <TypeValue type={value.type} types={lookups.types} />
    case "group":
      return <Value icon={GROUP_ICONS[value.groupKind]}>{value.name}</Value>
    case "people":
      return <People ids={value.ids} members={lookups.members} />
    case "ticket":
      return <TicketValue id={value.id} />
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
          {body.label}{" "}
          <TimelineChange
            from={<ActivityValueView value={body.from} lookups={lookups} />}
            to={<ActivityValueView value={body.to} lookups={lookups} />}
            toLabel={m.tickets_activity_field_to()}
          />
        </>
      )
  }
  return (
    <>
      {body.text}{" "}
      <TimelineQuote>
        <Markdown size="compact" blocks="flat">
          {body.quote}
        </Markdown>
      </TimelineQuote>
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
