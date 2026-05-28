import { Result, useAtomSet, useAtomValue } from "@effect-atom/atom-react"
import { AnimatePresence, motion } from "motion/react"
import { ChevronDown, Loader2, Plus } from "lucide-react"
import {
  useDeferredValue,
  useEffect,
  useRef,
  useState,
  type ReactNode
} from "react"
import { Button } from "@/components/ui/button"
import { Hitbox } from "@/components/ui/hitbox"
import {
  loadMoreTicketsAtom,
  ticketsListAtom,
  ticketsListKeyForStatus,
  type TicketsListValue
} from "@/atoms/tickets"
import { cn } from "@/lib/utils"
import { transitions } from "@/lib/springs"
import { m } from "@/paraglide/messages"
import { statusLabelFor } from "@/lib/ticket-meta"
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
  forceExpanded,
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
  forceExpanded: boolean
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

  const itemRowState = useStableTicketKeys(items, waiting)

  const remaining = Math.max(0, count - items.length)

  const gridCols = cn(
    "grid gap-y-1",
    showExtraActionsCol
      ? "grid-cols-[auto_auto_auto_minmax(0,1fr)_auto_auto]"
      : "grid-cols-[auto_auto_auto_minmax(0,1fr)_auto]",
    waiting && "animate-pulse"
  )

  const label = statusLabelFor(status, statuses)

  const morphFrom = { opacity: 0, filter: "blur(8px)" }
  const morphTo = { opacity: 1, filter: "blur(0px)" }

  const shellRef = useRef<HTMLDivElement>(null)

  const onStartCreate = () => {
    if (collapsed) onToggleCollapsed()
    setCreating(true)
  }
  const onDismissCreate = () => setCreating(false)

  return (
    <div
      className="flex flex-col gap-1 transition-opacity duration-200 ease-out"
      data-creating={creating || undefined}
    >
      <div
        ref={shellRef}
        onClick={creating ? undefined : onToggleCollapsed}
        className={cn(
          "sticky top-0 z-10 flex items-center gap-3 rounded-lg bg-muted px-3 py-2 transition-colors",
          !creating && "cursor-pointer hover:bg-foreground/5"
        )}
      >
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation()
            onToggleCollapsed()
          }}
          aria-expanded={!collapsed}
          aria-label={m.tickets_section_collapse_aria_label({ label })}
          className={cn(
            "grid size-6 shrink-0 cursor-pointer place-items-center rounded-md text-muted-foreground outline-none",
            "transition-colors hover:text-foreground",
            "focus-visible:ring-2 focus-visible:ring-ring",
            "active:scale-[0.9]"
          )}
        >
          <span className="translate-x-px">
            <ChevronDown
              className={cn(
                "size-4 transition-transform duration-150",
                collapsed && "-rotate-90"
              )}
              strokeWidth={1.75}
            />
          </span>
        </button>

        <div className="grid min-w-0 flex-1">
          <AnimatePresence mode="sync" initial={false}>
            {creating ? (
              <motion.div
                key="creator"
                initial={morphFrom}
                animate={morphTo}
                exit={morphFrom}
                transition={transitions.presence}
                className="min-w-0 self-center [grid-area:1/1]"
              >
                <SectionTicketCreator
                  orgSlug={orgSlug}
                  slug={slug}
                  status={status}
                  query={query}
                  containerRef={shellRef}
                  onDone={onDismissCreate}
                />
              </motion.div>
            ) : (
              <motion.div
                key="header"
                initial={morphFrom}
                animate={morphTo}
                exit={morphFrom}
                transition={transitions.presence}
                className="self-center [grid-area:1/1]"
              >
                <SectionHeader
                  status={status}
                  statuses={statuses}
                  count={count}
                />
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        <Hitbox
          mode="inline"
          margin="2"
          onClick={(e) => {
            e.stopPropagation()
            if (creating) onDismissCreate()
            else onStartCreate()
          }}
          aria-label={
            creating
              ? m.tickets_section_create_dismiss_aria_label({ label })
              : m.tickets_section_create_aria_label({ label })
          }
          title={
            creating
              ? m.tickets_section_create_dismiss_aria_label({ label })
              : m.tickets_section_create_aria_label({ label })
          }
        >
          <span className="grid size-6 shrink-0 place-items-center rounded-full text-muted-foreground transition-colors hover:bg-accent hover:text-foreground active:scale-[0.9]">
            <Plus
              className={cn(
                "size-4 transition-transform duration-200 ease-out",
                creating && "rotate-45"
              )}
              strokeWidth={1.75}
            />
          </span>
        </Hitbox>
      </div>

      <AnimatePresence initial={false}>
        {!collapsed && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{
              height: 0,
              opacity: 0,
              transition: forceExpanded ? { duration: 0 } : transitions.fade
            }}
            transition={transitions.fade}
            className="flex flex-col gap-1 overflow-hidden"
          >
            {items.length === 0 ? (
              <div className="px-3 py-4 text-center text-xs text-muted-foreground">
                —
              </div>
            ) : (
              <ul className={gridCols}>
                <AnimatePresence initial={false}>
                  {items.map((t, idx) => {
                    const membership = sprintMembership?.get(t.id) ?? null
                    const rowState = itemRowState[idx]
                    return (
                      <motion.li
                        key={rowState.key}
                        initial={{ opacity: 0, filter: "blur(8px)" }}
                        animate={{ opacity: 1, filter: "blur(0px)" }}
                        transition={transitions.presence}
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
                          pending={rowState.pending}
                        />
                      </motion.li>
                    )
                  })}
                </AnimatePresence>
              </ul>
            )}

            {nextCursor !== null && (
              <div className="flex justify-center py-2">
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

interface RowState {
  readonly key: string
  readonly pending: boolean
}

function useStableTicketKeys(
  items: ReadonlyArray<Ticket>,
  waiting: boolean
): ReadonlyArray<RowState> {
  const entriesRef = useRef<
    Map<TicketId, { key: string; bornWaiting: boolean }>
  >(new Map())
  const prevItemsRef = useRef<ReadonlyArray<Ticket>>(items)
  const prevWaitingRef = useRef<boolean>(waiting)

  const justSettled = prevWaitingRef.current && !waiting
  const prevItems = prevItemsRef.current
  const currIds = new Set(items.map((t) => t.id))

  const states = items.map<RowState>((t, idx) => {
    const existing = entriesRef.current.get(t.id)
    if (existing !== undefined) {
      const stillPending = existing.bornWaiting && waiting
      if (existing.bornWaiting && !waiting) {
        entriesRef.current.set(t.id, { ...existing, bornWaiting: false })
      }
      return { key: existing.key, pending: stillPending }
    }
    if (justSettled) {
      const prevAtIdx = prevItems[idx]
      if (prevAtIdx && !currIds.has(prevAtIdx.id)) {
        const prevEntry = entriesRef.current.get(prevAtIdx.id)
        const inheritedKey = prevEntry?.key ?? prevAtIdx.id
        entriesRef.current.set(t.id, {
          key: inheritedKey,
          bornWaiting: false
        })
        return { key: inheritedKey, pending: false }
      }
    }
    entriesRef.current.set(t.id, { key: t.id, bornWaiting: waiting })
    return { key: t.id, pending: waiting }
  })

  useEffect(() => {
    prevItemsRef.current = items
    prevWaitingRef.current = waiting
    if (entriesRef.current.size > 200) {
      const live = new Set(items.map((t) => t.id))
      for (const id of entriesRef.current.keys()) {
        if (!live.has(id)) entriesRef.current.delete(id)
      }
    }
  }, [items, waiting])

  return states
}
