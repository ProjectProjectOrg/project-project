import { PreviewCard } from "@base-ui/react/preview-card"
import { RegistryContext, useAtomValue } from "@effect/atom-react"
import {
  finishedStatusSlugs,
  type TicketId,
  type TicketStatus
} from "@pp/shared"
import { Link } from "@tanstack/react-router"
import * as Effect from "effect/Effect"
import * as Result from "effect/reactivity/AsyncResult"
import * as Registry from "effect/reactivity/AtomRegistry"
import {
  useContext,
  useEffect,
  type ComponentProps,
  type ReactNode
} from "react"

import { PreviewCardContent } from "@/components/ui/preview-card"
import type { ProjectRequest } from "@/features/projects/atoms/projects"
import {
  statusesFor,
  statusesRequest
} from "@/features/projects/atoms/projectStatuses"
import {
  ProjectContext,
  useProjectRequest,
  useProjectRoute
} from "@/features/projects/hooks/useProject"
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
import {
  previewRelationGroups,
  type RelationGroupKey,
  type RelationPreviewKind
} from "@/features/tickets/lib/relationGroups"
import { m } from "@/paraglide/messages"

type TicketPreview =
  | Readonly<{ kind: "ticket"; id: TicketId }>
  | Readonly<{ kind: "relations"; id: TicketId; relation: RelationPreviewKind }>
  | Readonly<{ kind: "subTickets"; id: TicketId; label: string }>

type TicketPreviewPayload = Readonly<{
  project: ProjectRequest
  preview: TicketPreview
}>

const ticketPreview = PreviewCard.createHandle<TicketPreviewPayload>()

const PREVIEW_DELAY_MS = 400

export function TicketPreviewTrigger({
  preview,
  ...props
}: Readonly<{ preview: TicketPreview }> &
  Omit<
    ComponentProps<typeof PreviewCard.Trigger>,
    "handle" | "payload" | "delay" | "onPointerEnter"
  >) {
  const project = useProjectRequest()
  const warm = useWarmPreview()
  return (
    <PreviewCard.Trigger
      handle={ticketPreview}
      payload={{ project, preview }}
      delay={PREVIEW_DELAY_MS}
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
    const loaded =
      preview.kind === "subTickets"
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
    <PreviewCard.Root handle={ticketPreview}>
      {({ payload }) =>
        payload !== undefined && (
          <PreviewCardContent
            className={
              payload.preview.kind === "ticket" ? "w-80" : "w-72 p-1.5"
            }
          >
            <ProjectContext value={payload.project}>
              <PreviewContent preview={payload.preview} />
            </ProjectContext>
          </PreviewCardContent>
        )
      }
    </PreviewCard.Root>
  )
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
        />
      )
    case "relations":
      return <RelationsPreview id={preview.id} relation={preview.relation} />
  }
  return <SubTicketsPreview id={preview.id} label={preview.label} />
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

function SubTicketsPreview({
  id,
  label
}: Readonly<{ id: TicketId; label: string }>) {
  const { orgSlug, slug } = useProjectRoute()
  const rows = useAtomValue(
    childTickets(childTicketsRequest(orgSlug, slug, id))
  )
  if (!Result.isSuccess(rows)) return <ListSkeleton />
  return (
    <PreviewList label={label}>
      {rows.value.map(({ key, ticket }) => (
        <PreviewTicketRow key={key} ticket={ticket} />
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
  ticket
}: Readonly<{
  ticket: Readonly<{ id: TicketId; title: string; status: TicketStatus }>
}>) {
  const { orgSlug, slug } = useProjectRoute()
  return (
    <Link
      to="/orgs/$orgSlug/projects/$slug/tickets/$id"
      params={{ orgSlug, slug, id: ticket.id }}
      preload="intent"
      className="flex min-w-0 items-center gap-2 rounded-md px-2 py-1.5 text-body text-muted-foreground transition-colors outline-none hover:bg-hover focus-visible:bg-hover"
    >
      <TicketStatusIcon status={ticket.status} orgSlug={orgSlug} slug={slug} />
      <span className="flex min-w-0 flex-1 items-baseline gap-2">
        <span className="shrink-0 font-mono text-caption tabular-nums">
          {ticket.id}
        </span>
        <span className="min-w-0 truncate text-foreground">{ticket.title}</span>
      </span>
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
