import {
  RegistryContext,
  useAtomRefresh,
  useAtomValue
} from "@effect/atom-react"
import {
  finishedStatusSlugs,
  type TicketFlag,
  type TagName,
  type TicketId,
  type TicketStatus
} from "@pp/shared"
import { Button } from "@pp/ui/button"
import { Markdown } from "@pp/ui/editor/markdown"
import { MentionScopeProvider } from "@pp/ui/editor/mentions/scope"
import {
  closeHoverCard,
  HoverCard,
  HoverCardContent,
  HoverCardTrigger
} from "@pp/ui/hover-card"
import { Copy } from "@pp/ui/icons"
import { MemberAvatar } from "@pp/ui/member-avatar"
import { TicketLine, TicketLines, TicketLinesLabel } from "@pp/ui/ticket-lines"
import type { HotkeyChord } from "@tanstack/react-hotkeys"
import { Link } from "@tanstack/react-router"
import * as Data from "effect/Data"
import * as Effect from "effect/Effect"
import * as Result from "effect/reactivity/AsyncResult"
import * as Registry from "effect/reactivity/AtomRegistry"
import { Fragment, useContext, useEffect, type ComponentProps } from "react"

import { AsyncView } from "@/components/shell/AsyncView"
import { project } from "@/features/projects/atoms/projects"
import {
  statusesFor,
  statusesRequest
} from "@/features/projects/atoms/projectStatuses"
import {
  ProjectContext,
  useProjectRequest,
  useProjectRoute
} from "@/features/projects/hooks/useProject"
import { tagsFor, tagsRequest, tagUsage } from "@/features/tags/atoms/tags"
import {
  childTickets,
  childTicketsRequest
} from "@/features/tickets/atoms/childTickets"
import {
  ticketDetail,
  ticketRequest
} from "@/features/tickets/atoms/ticketDetail"
import { TicketStatusIcon } from "@/features/tickets/components/ticket-marks/TicketStatusIcon"
import {
  loadMarkdown,
  TicketPreviewBody
} from "@/features/tickets/components/TicketHoverCard"
import { TimelineTime } from "@/features/tickets/components/TimelineTime"
import {
  previewRelationGroups,
  type RelationGroupKey,
  type RelationPreviewKind
} from "@/features/tickets/lib/relationGroups"
import type { TicketDetailSearch } from "@/features/tickets/lib/ticketSearch"
import { m } from "@/paraglide/messages"

export type TicketPreview = Data.TaggedEnum<{
  ticket: { readonly id: TicketId; readonly shortcut?: HotkeyChord }
  relations: { readonly id: TicketId; readonly relation: RelationPreviewKind }
  subTickets: {
    readonly id: TicketId
    readonly label: string
    readonly current?: TicketId
    readonly search?: TicketDetailSearch
  }
  flag: { readonly id: TicketId; readonly flag: TicketFlag }
  tag: { readonly name: TagName }
  tags: { readonly names: ReadonlyArray<TagName> }
}>
export const TicketPreview = Data.taggedEnum<TicketPreview>()

// Ticket previews are hover cards in the tooltip host: one on screen at a
// time, gliding between triggers. A click on a ticket line closes it at once.
const closePreviewNow = closeHoverCard

// A chip or link that previews on hover (and on focus). Chips whose preview
// holds more than they say (lists, a flag's reason) also open on click, for
// the keyboard and touch.
export function TicketPreviewTrigger({
  preview,
  onClick,
  ...props
}: Readonly<{ preview: TicketPreview }> &
  Omit<ComponentProps<typeof HoverCardTrigger>, "openOnClick">) {
  const project = useProjectRequest()
  const warm = useWarmPreview()
  const opensOnClick = !TicketPreview.$is("ticket")(preview)
  return (
    <HoverCard>
      <HoverCardTrigger
        openOnClick={opensOnClick}
        aria-haspopup={opensOnClick ? "dialog" : undefined}
        onPointerEnter={() => warm(preview)}
        onClick={(event) => {
          if (opensOnClick) {
            event.stopPropagation()
            warm(preview)
          }
          onClick?.(event)
        }}
        {...props}
      />
      <HoverCardContent className={PREVIEW_WIDTHS[preview._tag]}>
        <ProjectContext value={project}>
          <PreviewContent preview={preview} />
        </ProjectContext>
      </HoverCardContent>
    </HoverCard>
  )
}

function useWarmPreview() {
  const registry = useContext(RegistryContext)
  const { orgSlug, slug } = useProjectRoute()
  const detail = ({ id }: Readonly<{ id: TicketId }>) =>
    Registry.getResult(registry, ticketDetail(ticketRequest(orgSlug, slug, id)))
  return (preview: TicketPreview) => {
    const loaded = TicketPreview.$match(preview, {
      ticket: detail,
      relations: detail,
      subTickets: ({ id }) =>
        Registry.getResult(
          registry,
          childTickets(childTicketsRequest(orgSlug, slug, id))
        ),
      flag: () => null,
      tag: () =>
        Registry.getResult(registry, tagUsage(tagsRequest(orgSlug, slug))),
      tags: () => null
    })
    if (loaded === null) return
    void Effect.runPromise(Effect.ignore(loaded))
  }
}

// Loads the Markdown renderer ahead of the first ticket preview. (The
// previews themselves render where their triggers are.)
export function TicketPreviewRoot() {
  useEffect(() => {
    void loadMarkdown()
  }, [])
  return null
}

const PREVIEW_WIDTHS: Readonly<Record<TicketPreview["_tag"], string>> = {
  ticket: "w-80 p-3",
  // Ticket lists are menu rows, so the popup pads like a menu's.
  relations: "w-72 p-1",
  subTickets: "w-72 p-1",
  flag: "w-72 p-1.5",
  tag: "w-64 p-0",
  tags: "w-56 p-1.5"
}

function PreviewContent({ preview }: Readonly<{ preview: TicketPreview }>) {
  const { orgSlug, slug } = useProjectRoute()
  return TicketPreview.$match(preview, {
    ticket: ({ id, shortcut }) => (
      <TicketPreviewBody
        ticketId={id}
        scope={{ orgSlug, slug }}
        interactive
        shortcut={shortcut}
      />
    ),
    relations: ({ id, relation }) => (
      <RelationsPreview id={id} relation={relation} />
    ),
    subTickets: ({ id, label, current, search }) => (
      <SubTicketsPreview
        id={id}
        label={label}
        current={current}
        search={search}
      />
    ),
    flag: ({ flag }) => <FlagPreview flag={flag} />,
    tag: ({ name }) => <TagPreview name={name} />,
    tags: ({ names }) => <TagListPreview names={names} />
  })
}

export const RELATION_PREVIEW_LABELS: Readonly<
  Record<RelationGroupKey, () => string>
> = {
  blockedBy: m.tickets_preview_blocked_by,
  blocking: m.tickets_preview_blocking,
  related: m.tickets_preview_related,
  duplicateOf: m.tickets_preview_duplicate_of,
  duplicates: m.tickets_preview_duplicates
}

function RelationsPreview({
  id,
  relation
}: Readonly<{ id: TicketId; relation: RelationPreviewKind }>) {
  const { orgSlug, slug } = useProjectRoute()
  const detail = useAtomValue(ticketDetail(ticketRequest(orgSlug, slug, id)))
  const statuses = useAtomValue(statusesFor(statusesRequest(orgSlug, slug)))
  if (!Result.isSuccess(detail) || !Result.isSuccess(statuses)) {
    return <ListSkeleton />
  }
  const finished = new Set(finishedStatusSlugs(statuses.value))
  const groups = previewRelationGroups(
    detail.value.relations,
    relation,
    finished
  )
  if (groups.length === 0) return <PreviewEmpty />
  return (
    <TicketLines>
      {groups.map((group) => (
        <Fragment key={group.key}>
          <TicketLinesLabel>
            {RELATION_PREVIEW_LABELS[group.key]()}
          </TicketLinesLabel>
          {group.tickets.map((ticket) => (
            <PreviewTicketRow key={ticket.id} ticket={ticket} />
          ))}
        </Fragment>
      ))}
    </TicketLines>
  )
}

function FlagPreview({ flag }: Readonly<{ flag: TicketFlag }>) {
  const { orgSlug, slug } = useProjectRoute()
  const detail = useAtomValue(project(useProjectRequest()))
  const members = Result.isSuccess(detail) ? detail.value.members : undefined
  const member = members?.find((candidate) => candidate.id === flag.by)
  return (
    <div className="flex flex-col gap-1.5 px-2 py-1.5">
      <div className="flex min-w-0 items-center gap-1.5 text-caption text-muted-foreground">
        {member !== undefined && <MemberAvatar member={member} size={16} />}
        <span className="min-w-0 truncate">
          {m.tickets_flag_by({
            name:
              member?.name ||
              member?.email ||
              m.tickets_activity_actor_unknown()
          })}
        </span>
        <span aria-hidden>·</span>
        <TimelineTime at={flag.at} className="shrink-0" />
      </div>
      {flag.reason !== undefined && (
        <MentionScopeProvider scope={{ orgSlug, slug, members }}>
          <Markdown size="compact" blocks="flat" className="text-body">
            {flag.reason}
          </Markdown>
        </MentionScopeProvider>
      )}
    </div>
  )
}

function TagPreview({ name }: Readonly<{ name: TagName }>) {
  const { orgSlug, slug } = useProjectRoute()
  const request = tagsRequest(orgSlug, slug)
  const tags = useAtomValue(tagsFor(request))
  const usage = useAtomValue(tagUsage(request))
  const refreshUsage = useAtomRefresh(tagUsage(request))
  const color = Result.isSuccess(tags)
    ? tags.value.find((tag) => tag.name === name)?.color
    : undefined
  return (
    <div className="flex flex-col">
      <div className="flex min-w-0 items-center gap-2 px-3 py-2.5 text-body text-foreground">
        <span
          aria-hidden
          className="size-2.5 shrink-0 rounded-full bg-muted-foreground"
          style={{ backgroundColor: color }}
        />
        <span className="min-w-0 truncate">{name}</span>
      </div>
      <div className="flex items-center gap-1.5 border-t border-border/60 px-3 py-2.5 text-caption text-muted-foreground">
        <Copy className="size-3.5 shrink-0" strokeWidth={1.75} />
        <AsyncView
          result={usage}
          onInitial={() => <span className="h-3 w-20 rounded bg-muted" />}
          onFailure={() => (
            <>
              <span className="min-w-0 flex-1">
                {m.tags_usage_load_failed()}
              </span>
              <Button variant="ghost" size="xs" onClick={refreshUsage}>
                {m.error_page_retry_button()}
              </Button>
            </>
          )}
          onSuccess={({ value }) => {
            const count = value[name] ?? 0
            return count === 1
              ? m.tags_usage_one()
              : m.tags_usage_many({ count })
          }}
        />
      </div>
    </div>
  )
}

function TagListPreview({
  names
}: Readonly<{ names: ReadonlyArray<TagName> }>) {
  const { orgSlug, slug } = useProjectRoute()
  const tags = useAtomValue(tagsFor(tagsRequest(orgSlug, slug)))
  const colors = new Map(
    Result.isSuccess(tags) ? tags.value.map((tag) => [tag.name, tag.color]) : []
  )
  return (
    <ul className="flex flex-col">
      {names.map((name) => (
        <li
          key={name}
          className="flex min-w-0 items-center gap-2 px-2 py-1.5 text-body text-foreground"
        >
          <span
            aria-hidden
            className="size-2 shrink-0 rounded-full bg-muted-foreground"
            style={{ backgroundColor: colors.get(name) }}
          />
          <span className="min-w-0 truncate">{name}</span>
        </li>
      ))}
    </ul>
  )
}

function SubTicketsPreview({
  id,
  label,
  current,
  search
}: Readonly<{
  id: TicketId
  label: string
  current?: TicketId
  search?: TicketDetailSearch
}>) {
  const { orgSlug, slug } = useProjectRoute()
  const rows = useAtomValue(
    childTickets(childTicketsRequest(orgSlug, slug, id))
  )
  if (!Result.isSuccess(rows)) return <ListSkeleton />
  return (
    <TicketLines>
      <TicketLinesLabel>{label}</TicketLinesLabel>
      {rows.value.map(({ key, ticket }) => (
        <PreviewTicketRow
          key={key}
          ticket={ticket}
          current={ticket.id === current}
          search={search}
        />
      ))}
    </TicketLines>
  )
}

// A previewed ticket: a menu row (TicketLine) that opens the ticket.
function PreviewTicketRow({
  ticket,
  current = false,
  search
}: Readonly<{
  ticket: Readonly<{ id: TicketId; title: string; status: TicketStatus }>
  current?: boolean
  search?: TicketDetailSearch
}>) {
  const { orgSlug, slug } = useProjectRoute()
  return (
    <TicketLine
      status={
        <TicketStatusIcon
          status={ticket.status}
          orgSlug={orgSlug}
          slug={slug}
        />
      }
      ticketKey={ticket.id}
      title={ticket.title}
      current={current}
      onClick={closePreviewNow}
      render={
        <Link
          to="/orgs/$orgSlug/projects/$slug/tickets/$id"
          params={{ orgSlug, slug, id: ticket.id }}
          search={search ?? {}}
          preload="intent"
        />
      }
    />
  )
}

function PreviewEmpty() {
  return (
    <div className="px-2 py-1.5 text-caption text-muted-foreground">
      {m.tickets_preview_empty()}
    </div>
  )
}

function ListSkeleton() {
  return (
    <div className="space-y-2 p-2">
      <div className="h-3 w-1/3 rounded bg-muted" />
      <div className="h-4 w-full rounded bg-muted" />
    </div>
  )
}
