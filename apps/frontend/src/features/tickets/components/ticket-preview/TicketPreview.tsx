import { PreviewCard } from "@base-ui/react/preview-card"
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
import { Link } from "@tanstack/react-router"
import * as Effect from "effect/Effect"
import * as Result from "effect/reactivity/AsyncResult"
import * as Registry from "effect/reactivity/AtomRegistry"
import { Copy } from "lucide-react"
import {
  createRef,
  useContext,
  useEffect,
  type ComponentProps,
  type ReactNode
} from "react"

import { AsyncView } from "@/components/shell/AsyncView"
import { Button } from "@/components/ui/button"
import { PreviewCardContent } from "@/components/ui/preview-card"
import { Markdown } from "@/features/editor/components/Markdown"
import { MentionScopeProvider } from "@/features/editor/mentions/scope"
import { MemberAvatar } from "@/features/members/components/MemberAvatar"
import {
  project,
  type ProjectRequest
} from "@/features/projects/atoms/projects"
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
import { cn } from "@/lib/utils"
import { m } from "@/paraglide/messages"

type TicketPreview =
  | Readonly<{ kind: "ticket"; id: TicketId; shortcut?: string }>
  | Readonly<{ kind: "relations"; id: TicketId; relation: RelationPreviewKind }>
  | Readonly<{
      kind: "subTickets"
      id: TicketId
      label: string
      current?: TicketId
      search?: TicketDetailSearch
    }>
  | Readonly<{ kind: "flag"; id: TicketId; flag: TicketFlag }>
  | Readonly<{ kind: "tag"; name: TagName }>
  | Readonly<{ kind: "tags"; names: ReadonlyArray<TagName> }>

type TicketPreviewPayload = Readonly<{
  project: ProjectRequest
  preview: TicketPreview
}>

const ticketPreview = PreviewCard.createHandle<TicketPreviewPayload>()
const ticketPreviewActions = createRef<PreviewCard.Root.Actions>()

const closePreviewNow = () => {
  ticketPreview.close()
  ticketPreviewActions.current?.unmount()
}

const PREVIEW_DELAY_MS = 400

export function TicketPreviewTrigger({
  preview,
  ...props
}: Readonly<{ preview: TicketPreview }> &
  Omit<
    ComponentProps<typeof PreviewCard.Trigger>,
    "handle" | "payload" | "delay" | "closeDelay" | "onPointerEnter"
  >) {
  const project = useProjectRequest()
  const warm = useWarmPreview()
  return (
    <PreviewCard.Trigger
      handle={ticketPreview}
      payload={{ project, preview }}
      delay={PREVIEW_DELAY_MS}
      closeDelay={0}
      aria-haspopup={preview.kind === "ticket" ? undefined : "dialog"}
      onPointerEnter={() => warm(preview)}
      onClick={
        preview.kind === "ticket"
          ? undefined
          : (event) => {
              event.stopPropagation()
              warm(preview)
              ticketPreview.open(event.currentTarget.id)
            }
      }
      {...props}
    />
  )
}

function useWarmPreview() {
  const registry = useContext(RegistryContext)
  const { orgSlug, slug } = useProjectRoute()
  return (preview: TicketPreview) => {
    if (preview.kind === "flag" || preview.kind === "tags") return
    const loaded =
      preview.kind === "tag"
        ? Registry.getResult(registry, tagUsage(tagsRequest(orgSlug, slug)))
        : preview.kind === "subTickets"
          ? Registry.getResult(
              registry,
              childTickets(childTicketsRequest(orgSlug, slug, preview.id))
            )
          : Registry.getResult(
              registry,
              ticketDetail(ticketRequest(orgSlug, slug, preview.id))
            )
    void Effect.runPromise(Effect.ignore(loaded))
  }
}

export function TicketPreviewRoot() {
  useEffect(() => {
    void loadMarkdown()
  }, [])
  return (
    <PreviewCard.Root handle={ticketPreview} actionsRef={ticketPreviewActions}>
      {({ payload }) =>
        payload !== undefined && (
          <PreviewCardContent className={PREVIEW_WIDTHS[payload.preview.kind]}>
            <ProjectContext value={payload.project}>
              <PreviewContent preview={payload.preview} />
            </ProjectContext>
          </PreviewCardContent>
        )
      }
    </PreviewCard.Root>
  )
}

const PREVIEW_WIDTHS: Readonly<Record<TicketPreview["kind"], string>> = {
  ticket: "w-80",
  relations: "w-72 p-1.5",
  subTickets: "w-72 p-1.5",
  flag: "w-72 p-1.5",
  tag: "w-64 p-0",
  tags: "w-56 p-1.5"
}

function PreviewContent({ preview }: Readonly<{ preview: TicketPreview }>) {
  const { orgSlug, slug } = useProjectRoute()
  switch (preview.kind) {
    case "ticket":
      return (
        <TicketPreviewBody
          ticketId={preview.id}
          scope={{ orgSlug, slug }}
          interactive
          shortcut={preview.shortcut}
        />
      )
    case "relations":
      return <RelationsPreview id={preview.id} relation={preview.relation} />
    case "flag":
      return <FlagPreview flag={preview.flag} />
    case "tag":
      return <TagPreview name={preview.name} />
    case "tags":
      return <TagListPreview names={preview.names} />
  }
  return (
    <SubTicketsPreview
      id={preview.id}
      label={preview.label}
      current={preview.current}
      search={preview.search}
    />
  )
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
  return groups.map((group) => (
    <PreviewList key={group.key} label={RELATION_PREVIEW_LABELS[group.key]()}>
      {group.tickets.map((ticket) => (
        <PreviewTicketRow key={ticket.id} ticket={ticket} />
      ))}
    </PreviewList>
  ))
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
    <PreviewList label={label}>
      {rows.value.map(({ key, ticket }) => (
        <PreviewTicketRow
          key={key}
          ticket={ticket}
          current={ticket.id === current}
          search={search}
        />
      ))}
    </PreviewList>
  )
}

function PreviewList({
  label,
  children
}: Readonly<{ label: string; children: ReactNode }>) {
  return (
    <div className="flex flex-col">
      <div className="px-2 pt-1 pb-1.5 text-caption text-muted-foreground">
        {label}
      </div>
      {children}
    </div>
  )
}

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
  const className =
    "flex min-w-0 items-center gap-2 rounded-md px-2 py-1.5 text-body text-muted-foreground"
  const content = (
    <>
      <TicketStatusIcon status={ticket.status} orgSlug={orgSlug} slug={slug} />
      <span className="flex min-w-0 flex-1 items-baseline gap-2">
        <span className="shrink-0 font-mono text-caption tabular-nums">
          {ticket.id}
        </span>
        <span className="min-w-0 truncate text-foreground">{ticket.title}</span>
      </span>
    </>
  )
  if (current) {
    return (
      <div aria-current="page" className={cn(className, "bg-active")}>
        {content}
      </div>
    )
  }
  return (
    <Link
      to="/orgs/$orgSlug/projects/$slug/tickets/$id"
      params={{ orgSlug, slug, id: ticket.id }}
      search={search ?? {}}
      preload="intent"
      onClick={closePreviewNow}
      className={cn(
        className,
        "transition-colors outline-none hover:bg-hover focus-visible:bg-hover"
      )}
    >
      {content}
    </Link>
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
