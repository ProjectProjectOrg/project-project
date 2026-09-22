import { useAtomSet, useAtomValue } from "@effect/atom-react"
import type {
  Group,
  Member,
  ProjectStatus,
  Ticket,
  TicketId,
  TicketListQuery,
  TicketStatus
} from "@pp/shared"
import * as Result from "effect/unstable/reactivity/AsyncResult"
import { Loader2 } from "lucide-react"
import {
  useMemo,
  useRef,
  useState,
  type ReactNode,
  type ComponentType,
  type ComponentProps
} from "react"

import { ErrorPage } from "@/components/ErrorPage"
import { Button } from "@/components/ui/button"
import {
  backlogRequest,
  encodeTicketListQuery,
  flatBacklogRequest,
  loadMoreBacklog,
  type BacklogRequest,
  type BacklogSection
} from "@/features/tickets/atoms/backlog"
import { cn } from "@/lib/utils"
import { m } from "@/paraglide/messages"

import { Row } from "./Row"
import { SectionHeader, type SectionHeading } from "./SectionHeader"
import { SectionTicketCreator } from "./SectionTicketCreator"
import { AutoLoad, VirtualRows } from "./VirtualRows"

export function SectionList({
  orgSlug,
  slug,
  status,
  statuses,
  query,
  count,
  page,
  collapsed,
  onToggleCollapsed,
  members,
  sprintMembership,
  extraRowActions,
  showSprintCol,
  showExtraActionsCol,
  activePreviewId,
  onPreviewPointerEnter,
  onPreviewOpenChange,
  heading,
  canCreate = true,
  pagination,
  listKey,
  rowComponent: RowComponent = Row,
  emptyMessage,
  creationVariant = "status"
}: {
  heading?: SectionHeading
  listKey?: string
  canCreate?: boolean
  pagination?: ReactNode
  rowComponent?: ComponentType<ComponentProps<typeof Row>>
  creationVariant?: "status" | "flat"
  emptyMessage?: string
  orgSlug: string
  slug: string
  status: TicketStatus
  statuses: ReadonlyArray<ProjectStatus>
  query: TicketListQuery
  count: number
  page: BacklogSection
  collapsed: boolean
  onToggleCollapsed: () => void
  members: ReadonlyArray<Member>
  sprintMembership?: ReadonlyMap<TicketId, Group>
  extraRowActions?: (ticket: Ticket) => ReactNode
  showSprintCol: boolean
  showExtraActionsCol: boolean
  activePreviewId: TicketId | null
  onPreviewPointerEnter: (ticketId: TicketId) => void
  onPreviewOpenChange: (ticketId: TicketId, open: boolean) => void
}) {
  const req = useMemo(
    () =>
      creationVariant === "flat"
        ? flatBacklogRequest(orgSlug, slug, query)
        : backlogRequest(orgSlug, slug, query),
    [creationVariant, orgSlug, slug, query]
  )
  const sectionKey =
    listKey ??
    `${orgSlug}/${slug}/${status}/${encodeTicketListQuery(req.query)}`
  const [creating, setCreating] = useState(false)

  const { items } = page

  const gridCols = cn(
    "grid gap-y-1",
    showExtraActionsCol
      ? "grid-cols-[auto_auto_auto_minmax(0,1fr)_auto_auto_auto]"
      : "grid-cols-[auto_auto_auto_minmax(0,1fr)_auto_auto]"
  )

  const shellRef = useRef<HTMLDivElement>(null)

  const onStartCreate = () => {
    if (collapsed) onToggleCollapsed()
    setCreating(true)
  }
  const onDismissCreate = () => setCreating(false)

  return (
    <div
      className="flex flex-col transition-opacity duration-200 ease-out"
      data-creating={creating || undefined}
    >
      <SectionHeader
        ref={shellRef}
        variant="sticky"
        heading={heading}
        canCreate={canCreate}
        status={status}
        statuses={statuses}
        count={count}
        collapsed={collapsed}
        creating={creating}
        onToggleCollapsed={onToggleCollapsed}
        onStartCreate={onStartCreate}
        onDismissCreate={onDismissCreate}
        creator={
          <SectionTicketCreator
            variant={creationVariant}
            orgSlug={orgSlug}
            slug={slug}
            status={status}
            query={query}
            containerRef={shellRef}
            onDone={onDismissCreate}
          />
        }
      />

      <div
        aria-hidden={collapsed || undefined}
        inert={collapsed ? true : undefined}
        className={cn(
          "grid transition-[grid-template-rows,opacity] duration-150 ease-[cubic-bezier(0.65,0,0.35,1)] motion-reduce:transition-none",
          collapsed
            ? "grid-rows-[0fr] opacity-0"
            : "grid-rows-[1fr] opacity-100"
        )}
      >
        <div className="min-h-0 overflow-hidden">
          <div className="flex flex-col gap-1 pt-1">
            {items.length === 0 ? (
              <div className="px-3 py-4 text-center text-xs text-muted-foreground">
                {emptyMessage ?? "—"}
              </div>
            ) : (
              <VirtualRows
                key={sectionKey}
                className={gridCols}
                rowKeys={items.map((row) => row.key)}
                activeIndex={items.findIndex(
                  ({ ticket }) => ticket.id === activePreviewId
                )}
              >
                {(index) => {
                  const { ticket, pending } = items[index]
                  return (
                    <div
                      inert={pending}
                      aria-busy={pending}
                      className={cn(
                        "col-span-full grid grid-cols-subgrid",
                        pending && "pointer-events-none animate-pulse"
                      )}
                    >
                      <RowComponent
                        orgSlug={orgSlug}
                        slug={slug}
                        ticket={ticket}
                        req={req}
                        members={members}
                        showSprintCol={showSprintCol}
                        showExtraActionsCol={showExtraActionsCol}
                        sprintMembership={
                          sprintMembership?.get(ticket.id) ?? null
                        }
                        extraRowActions={extraRowActions}
                        pending={pending}
                        previewOpen={activePreviewId === ticket.id}
                        onPreviewPointerEnter={onPreviewPointerEnter}
                        onPreviewOpenChange={onPreviewOpenChange}
                      />
                    </div>
                  )
                }}
              </VirtualRows>
            )}

            {pagination ?? (
              <SectionPagination
                req={req}
                collapsed={collapsed}
                status={status}
                page={page}
                count={count}
              />
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

function SectionPagination({
  req,
  status,
  page,
  count,
  collapsed
}: {
  req: BacklogRequest
  status: TicketStatus
  page: BacklogSection
  count: number
  collapsed: boolean
}) {
  const loadMore = useAtomSet(loadMoreBacklog({ req, status }))
  const loadMoreState = useAtomValue(loadMoreBacklog({ req, status }))
  const loadingMore = loadMoreState.waiting

  const { items, nextCursor } = page
  const remaining = Math.max(0, count - items.length)
  return (
    <>
      {Result.matchWithError(loadMoreState, {
        onInitial: () => null,
        onError: (error) => (
          <ErrorPage error={error} reset={() => loadMore()} contained />
        ),
        onDefect: (defect) => (
          <ErrorPage error={defect} reset={() => loadMore()} contained />
        ),
        onSuccess: () => null
      })}
      <TicketPagination
        nextCursor={nextCursor}
        remaining={remaining}
        collapsed={collapsed}
        loadingMore={loadingMore}
        failed={Result.isFailure(loadMoreState)}
        loadMore={() => loadMore()}
      />
    </>
  )
}

export function TicketPagination({
  nextCursor,
  remaining,
  collapsed,
  loadingMore,
  failed,
  loadMore
}: {
  nextCursor: string | null
  remaining: number
  collapsed: boolean
  loadingMore: boolean
  failed: boolean
  loadMore: () => void
}) {
  return (
    <>
      {nextCursor !== null && (
        <AutoLoad
          key={nextCursor}
          cursor={nextCursor}
          enabled={!collapsed && !loadingMore && !failed}
          loadMore={loadMore}
        >
          {failed ? (
            <Button
              type="button"
              variant="tertiary"
              size="sm"
              onClick={loadMore}
            >
              {m.tickets_section_load_more_button({ remaining })}
            </Button>
          ) : (
            <div
              role="status"
              className={cn(
                "flex h-7 items-center gap-2 text-xs text-muted-foreground",
                !loadingMore && "invisible"
              )}
            >
              <Loader2
                className="size-4 animate-spin motion-reduce:animate-none"
                strokeWidth={1.75}
              />
              {m.tickets_load_more_loading()}
            </div>
          )}
        </AutoLoad>
      )}
    </>
  )
}
