import { useAtomSet, useAtomValue } from "@effect/atom-react"
import type { Member, ProjectStatus, Ticket, TicketId } from "@pp/shared"
import {
  boardCardSlotClass,
  BoardColumnAddButton,
  BoardColumnHeader,
  BoardColumnTitle,
  BoardCollapsedColumnHeader
} from "@pp/ui/board-column"
import {
  BoardColumnFrame,
  useBoardCardDrag,
  useBoardColumnDrop
} from "@pp/ui/board-drag"
import { cn } from "@pp/ui/lib/utils"
import { StatusGlyph } from "@pp/ui/status-glyph"
import { m as motion } from "motion/react"
import {
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode
} from "react"

import {
  justCreatedTicket,
  type JustCreatedTicket
} from "@/features/tickets/atoms/createTicket"
import type { TicketUpdates } from "@/features/tickets/atoms/ticketRows"
import {
  CreatedFlash,
  RowEnter
} from "@/features/tickets/components/ticket-list/CreatedRow"
import { isFresh } from "@/features/tickets/lib/createdRow"
import { statusMetaFor } from "@/features/tickets/lib/ticketMeta"
import { m } from "@/paraglide/messages"

import type { ColumnCreate } from "../hooks/useBoardDraft"
import { BoardKeyboardContext } from "../hooks/useBoardKeyboardNavigation"
import type { ColumnReorder } from "../hooks/useStatusReorder"
import { BoardTicketDraft } from "./BoardTicketDraft"
import { SprintBoardCard } from "./SprintBoardCard"
import { VirtualSprintCards } from "./VirtualSprintCards"

function MetaGlyph({
  meta
}: Readonly<{ meta: ReturnType<typeof statusMetaFor> }>) {
  return <StatusGlyph icon={meta.icon} color={meta.color} />
}

export function SprintBoardColumn({
  update,
  columnIndex,
  status,
  statuses,
  tickets,
  filterKey,
  count: countOverride,
  members,
  isDraggable,
  pendingId = null,
  ordered = true,
  overlay,
  inertTicketIds,
  lastFlash,
  reorderMode,
  reorder,
  collapsed = false,
  onToggleCollapsed,
  create,
  keyOf,
  footer
}: {
  update: TicketUpdates
  columnIndex: number
  status: Ticket["status"]
  statuses: ReadonlyArray<ProjectStatus>
  tickets: ReadonlyArray<Ticket>
  filterKey: string
  count?: number
  members: ReadonlyArray<Member>
  isDraggable: boolean
  pendingId?: TicketId | null
  ordered?: boolean
  overlay?: ReadonlyMap<TicketId, string>
  inertTicketIds?: ReadonlySet<TicketId>
  lastFlash: { id: TicketId; tick: number } | null
  // A column is being dragged: cards take no drops meanwhile.
  reorderMode: boolean
  reorder?: ColumnReorder
  collapsed?: boolean
  onToggleCollapsed?: () => void
  create?: ColumnCreate
  keyOf?: (ticket: Ticket) => string
  footer?: (nearEnd: boolean) => ReactNode
}) {
  const keyboard = useContext(BoardKeyboardContext)
  const meta = statusMetaFor(status, statuses)
  const [columnEl, setColumnEl] = useState<HTMLElement | null>(null)
  const dragOver = useBoardColumnDrop(
    columnEl,
    status,
    isDraggable && !reorderMode
  )

  const created = useAtomValue(justCreatedTicket)
  const setCreated = useAtomSet(justCreatedTicket)
  const clearCreated = useCallback(() => setCreated(null), [setCreated])
  const holdsCreated =
    created !== null && tickets.some((ticket) => ticket.id === created.id)
  const opened = useRef<JustCreatedTicket | null>(null)
  useEffect(() => {
    if (!collapsed || !holdsCreated || created === opened.current) return
    opened.current = created
    if (created !== null && isFresh(created.at)) onToggleCollapsed?.()
  }, [collapsed, holdsCreated, created, onToggleCollapsed])

  const [overflowing, setOverflowing] = useState(false)
  const count = countOverride ?? tickets.length
  const glyph = <MetaGlyph meta={meta} />

  return (
    <BoardColumnFrame
      ref={setColumnEl}
      value={status}
      tone={meta.color}
      collapsed={collapsed}
      over={dragOver}
      onReorderStart={reorder?.start}
      onReorderEnd={reorder?.end}
      role={keyboard ? "gridcell" : undefined}
      aria-colindex={keyboard ? columnIndex + 1 : undefined}
      aria-label={meta.label}
      data-board-column={status}
    >
      {({ startReorder }) =>
        collapsed ? (
          <BoardCollapsedColumnHeader
            icon={glyph}
            label={meta.label}
            count={count}
            expandLabel={m.sprints_board_column_expand({ status: meta.label })}
            onExpand={onToggleCollapsed}
          />
        ) : (
          <div className="flex min-h-0 w-72 flex-1 shrink-0 flex-col">
            <BoardColumnHeader
              title={<BoardColumnTitle icon={glyph} label={meta.label} />}
              count={count}
              onCollapse={onToggleCollapsed}
              collapseLabel={m.sprints_board_column_collapse({
                status: meta.label
              })}
              onReorderStart={reorder ? startReorder : undefined}
              onReorderKey={reorder?.move}
              reorderLabel={m.sprints_board_column_reorder({
                status: meta.label
              })}
            />
            <div
              style={{ pointerEvents: reorderMode ? "none" : undefined }}
              className="relative flex min-h-0 flex-initial flex-col"
            >
              <VirtualSprintCards
                tickets={tickets}
                total={count}
                isDraggable={isDraggable && !reorderMode}
                showDropGap={ordered}
                filterKey={filterKey}
                status={status}
                footer={footer}
                draft={
                  create?.draft
                    ? {
                        key: create.draft.key,
                        index: create.draft.index,
                        node: (
                          <BoardTicketDraft
                            status={status}
                            tickets={tickets}
                            index={create.draft.index}
                            column={create}
                            initialTitle={create.draft.title}
                            initialError={create.draft.error}
                          />
                        )
                      }
                    : null
                }
                onInsertAt={create?.insertable ? create.open : undefined}
                onOverflowChange={setOverflowing}
                keyOf={keyOf}
              >
                {(ticket) => (
                  <CardSlot
                    update={update}
                    ordered={ordered}
                    ticket={ticket}
                    status={status}
                    members={members}
                    isDraggable={isDraggable && !reorderMode}
                    inert={inertTicketIds?.has(ticket.id) ?? false}
                    pending={
                      ticket.id === pendingId ||
                      (overlay?.has(ticket.id) ?? false)
                    }
                    flashKey={
                      lastFlash?.id === ticket.id ? lastFlash.tick : undefined
                    }
                    created={created?.id === ticket.id ? created : null}
                    onCreatedShown={clearCreated}
                  />
                )}
              </VirtualSprintCards>
            </div>
            {create && (
              <BoardColumnAddButton
                label={m.sprints_board_add_ticket()}
                pinned={overflowing}
                folded={create.draft !== null}
                onClick={() => create.open(tickets.length)}
              />
            )}
          </div>
        )
      }
    </BoardColumnFrame>
  )
}

function CardSlot({
  update,
  ticket,
  status,
  members,
  isDraggable,
  ordered,
  inert,
  pending,
  flashKey,
  created,
  onCreatedShown
}: {
  update: TicketUpdates
  ticket: Ticket
  status: Ticket["status"]
  members: ReadonlyArray<Member>
  isDraggable: boolean
  ordered: boolean
  inert: boolean
  pending: boolean
  flashKey: number | undefined
  created: JustCreatedTicket | null
  onCreatedShown: () => void
}) {
  const ref = useRef<HTMLDivElement>(null)
  const cardRef = useRef<HTMLDivElement>(null)
  const dragging = useBoardCardDrag({
    slot: ref,
    card: cardRef,
    id: ticket.id,
    status,
    enabled: isDraggable && !inert,
    ordered
  })

  return (
    <div
      ref={ref}
      inert={inert}
      aria-busy={inert}
      className={cn(boardCardSlotClass, inert && "pointer-events-none")}
    >
      <RowEnter enter={created !== null && isFresh(created.at)}>
        <div
          ref={cardRef}
          className={cn(
            "relative rounded-lg",
            dragging && "opacity-40",
            pending && "animate-pulse"
          )}
        >
          {created !== null && (
            <CreatedFlash
              at={created.at}
              className="z-10 rounded-md"
              onDone={onCreatedShown}
            />
          )}
          <motion.div
            key={flashKey ?? 0}
            initial={
              flashKey ? { boxShadow: "0 0 0 3px var(--foreground)" } : false
            }
            animate={{ boxShadow: "0 0 0 0px transparent" }}
            transition={{ duration: 0.6, ease: "easeOut" }}
            className="rounded-lg"
          >
            <SprintBoardCard
              pendingKey={inert}
              update={update}
              ticket={ticket}
              members={members}
            />
          </motion.div>
        </div>
      </RowEnter>
    </div>
  )
}
