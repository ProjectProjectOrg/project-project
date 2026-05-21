import { Result, useAtomSet, useAtomValue } from "@effect-atom/atom-react"
import { AnimatePresence, motion } from "motion/react"
import { Loader2 } from "lucide-react"
import { useDeferredValue, useRef, useState, type ReactNode } from "react"
import { Button } from "@/components/ui/button"
import {
  loadMoreTicketsAtom,
  ticketsListAtom,
  ticketsListKeyForStatus,
  type TicketsListValue
} from "@/atoms/tickets"
import { cn } from "@/lib/utils"
import { m } from "@/paraglide/messages"
import type {
  Group,
  Member,
  ProjectStatus,
  Ticket,
  TicketId,
  TicketListQuery,
  TicketStatus
} from "@projectproject/shared"
import { Row } from "./Row"
import { SectionHeader } from "./SectionHeader"
import { SectionTicketCreator } from "./SectionTicketCreator"

const EMPTY_ITEMS: ReadonlyArray<Ticket> = []

export function SectionList({
  orgSlug,
  slug,
  status,
  statuses,
  query,
  count,
  collapsed,
  onToggleCollapsed,
  members,
  sprintMembership,
  extraRowActions,
  showSprintCol,
  showExtraActionsCol
}: {
  orgSlug: string
  slug: string
  status: TicketStatus
  statuses: ReadonlyArray<ProjectStatus>
  query: TicketListQuery
  count: number
  collapsed: boolean
  onToggleCollapsed: () => void
  members: ReadonlyArray<Member>
  sprintMembership?: ReadonlyMap<TicketId, Group>
  extraRowActions?: (ticket: Ticket) => ReactNode
  showSprintCol: boolean
  showExtraActionsCol: boolean
}) {
  const sectionKey = ticketsListKeyForStatus(orgSlug, slug, query, status)
  const deferredKey = useDeferredValue(sectionKey)
  const list = useAtomValue(ticketsListAtom(deferredKey))
  const isStaleKey = sectionKey !== deferredKey

  const previousRef = useRef<TicketsListValue | null>(null)
  if (Result.isSuccess(list)) previousRef.current = list.value

  const loadMore = useAtomSet(loadMoreTicketsAtom(deferredKey))
  const loadMoreState = useAtomValue(loadMoreTicketsAtom(deferredKey))
  const loadingMore = loadMoreState.waiting

  const [creating, setCreating] = useState(false)

  const items: ReadonlyArray<Ticket> = Result.isSuccess(list)
    ? list.value.items
    : (previousRef.current?.items ?? EMPTY_ITEMS)
  const nextCursor: string | null = Result.isSuccess(list)
    ? list.value.nextCursor
    : (previousRef.current?.nextCursor ?? null)
  const waiting =
    (Result.isSuccess(list) && list.waiting === true) || isStaleKey

  const remaining = Math.max(0, count - items.length)

  const gridCols = cn(
    "grid divide-y divide-border border-x border-b border-border bg-background",
    showExtraActionsCol
      ? "grid-cols-[auto_auto_auto_minmax(0,1fr)_auto_auto]"
      : "grid-cols-[auto_auto_auto_minmax(0,1fr)_auto]",
    waiting && "animate-pulse",
    "rounded-b-xl"
  )

  return (
    <div className="flex flex-col">
      {creating ? (
        <div className="sticky top-0 z-10 rounded-t-xl border border-border bg-background/95 px-2 py-2 backdrop-blur">
          <SectionTicketCreator
            orgSlug={orgSlug}
            slug={slug}
            status={status}
            query={query}
            onDone={() => setCreating(false)}
          />
        </div>
      ) : (
        <SectionHeader
          status={status}
          statuses={statuses}
          count={count}
          collapsed={collapsed}
          onToggleCollapsed={onToggleCollapsed}
          onStartCreate={() => setCreating(true)}
        />
      )}

      <AnimatePresence initial={false}>
        {!collapsed && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.15 }}
            className="overflow-hidden"
          >
            {items.length === 0 ? (
              <div className="rounded-b-xl border-x border-b border-border bg-background px-3 py-4 text-center text-xs text-muted-foreground">
                —
              </div>
            ) : (
              <ul className={gridCols}>
                {items.map((t) => {
                  const membership = sprintMembership?.get(t.id) ?? null
                  return (
                    <li
                      key={t.id}
                      className="col-span-full grid grid-cols-subgrid"
                    >
                      <Row
                        orgSlug={orgSlug}
                        slug={slug}
                        ticket={t}
                        query={query}
                        members={members}
                        showSprintCol={showSprintCol}
                        showExtraActionsCol={showExtraActionsCol}
                        sprintMembership={membership}
                        extraRowActions={extraRowActions}
                      />
                    </li>
                  )
                })}
              </ul>
            )}

            {nextCursor !== null && (
              <div className="flex justify-center border-x border-b border-border bg-background py-2">
                <Button
                  type="button"
                  variant="tertiary"
                  size="sm"
                  onClick={() => loadMore()}
                  disabled={loadingMore}
                >
                  {loadingMore ? (
                    <>
                      <Loader2
                        className="size-4 animate-spin"
                        strokeWidth={1.75}
                      />
                      {m.tickets_load_more_loading()}
                    </>
                  ) : (
                    m.tickets_section_load_more_button({ remaining })
                  )}
                </Button>
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
