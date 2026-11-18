import { RegistryContext, useAtomValue } from "@effect/atom-react"
import { hasSubTickets, type Ticket, type TicketId } from "@pp/shared"
import {
  BoardCardSubTicket,
  BoardCardSubTickets,
  BoardCardSubTicketsMore,
  BoardCardSubTicketsNote,
  subTicketsShown
} from "@pp/ui/board-card"
import { transitions } from "@pp/ui/lib/springs"
import { Link } from "@tanstack/react-router"
import * as Effect from "effect/Effect"
import * as Result from "effect/reactivity/AsyncResult"
import * as Registry from "effect/reactivity/AtomRegistry"
import { AnimatePresence, motion } from "motion/react"
import { useContext, useState } from "react"

import { useProjectRoute } from "@/features/projects/hooks/useProject"
import {
  childTickets,
  childTicketsRequest
} from "@/features/tickets/atoms/childTickets"
import { TicketStatusIcon } from "@/features/tickets/components/ticket-marks/TicketStatusIcon"
import { useSubTicketsExpanded } from "@/features/tickets/hooks/useSubTicketsExpanded"
import type { TicketRow } from "@/features/tickets/lib/ticketRows"
import { m } from "@/paraglide/messages"

type Parent = Pick<Ticket, "id" | "subTicketCount" | "subTicketDoneCount">

function useHeightReveal() {
  const [animating, setAnimating] = useState(false)
  return {
    initial: { height: 0 },
    animate: { height: "auto" },
    exit: { height: 0 },
    transition: transitions.layout,
    onAnimationStart: () => setAnimating(true),
    onAnimationComplete: () => setAnimating(false),
    style: animating ? { pointerEvents: "none" as const } : undefined
  }
}

export function useChildTicketsPreload(parent: Parent) {
  const registry = useContext(RegistryContext)
  const { orgSlug, slug } = useProjectRoute()
  return () => {
    if (!hasSubTickets(parent)) return
    void Effect.runPromise(
      Registry.getResult(
        registry,
        childTickets(childTicketsRequest(orgSlug, slug, parent.id))
      ).pipe(Effect.ignore)
    )
  }
}

export function BoardCardChildren({ parent }: Readonly<{ parent: Parent }>) {
  const [expandedByDefault] = useSubTicketsExpanded()
  const heightReveal = useHeightReveal()
  const expanded = hasSubTickets(parent) && expandedByDefault
  return (
    <AnimatePresence initial={false}>
      {expanded && (
        <motion.div {...heightReveal} className="overflow-y-clip">
          <div className="pt-2">
            <ExpandedChildren parent={parent.id} />
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}

function ExpandedChildren({ parent }: Readonly<{ parent: TicketId }>) {
  const { orgSlug, slug } = useProjectRoute()
  const req = childTicketsRequest(orgSlug, slug, parent)
  const result = useAtomValue(childTickets(req))
  const status = Result.isInitial(result)
    ? m.tickets_sub_tickets_loading()
    : Result.isFailure(result)
      ? m.tickets_sub_tickets_load_failed()
      : null
  return (
    <BoardCardSubTickets>
      {status !== null ? (
        <BoardCardSubTicketsNote loading={Result.isInitial(result)}>
          {status}
        </BoardCardSubTicketsNote>
      ) : (
        <ChildLines rows={Result.getOrElse(result, () => [])} />
      )}
    </BoardCardSubTickets>
  )
}

function ChildLines({
  rows
}: Readonly<{
  rows: ReadonlyArray<TicketRow>
}>) {
  const [showAll, setShowAll] = useState(false)
  const heightReveal = useHeightReveal()
  const shown = subTicketsShown(rows.length)
  const hidden = rows.length - shown
  const idWidth = `${Math.max(...rows.map((row) => row.ticket.id.length))}ch`
  const line = (row: TicketRow) => (
    <ChildLine key={row.key} ticket={row.ticket} idWidth={idWidth} />
  )
  return (
    <>
      {rows.slice(0, shown).map(line)}
      <AnimatePresence initial={false}>
        {showAll && hidden > 0 && (
          <motion.li
            {...heightReveal}
            className="col-span-full grid grid-cols-subgrid overflow-y-clip"
          >
            <ul className="contents">{rows.slice(shown).map(line)}</ul>
          </motion.li>
        )}
      </AnimatePresence>
      {hidden > 0 && (
        <BoardCardSubTicketsMore onClick={() => setShowAll((all) => !all)}>
          {showAll
            ? m.tickets_sub_tickets_show_less()
            : m.tickets_sub_tickets_show_more({ count: hidden })}
        </BoardCardSubTicketsMore>
      )}
    </>
  )
}

function ChildLine({
  ticket,
  idWidth
}: Readonly<{ ticket: Ticket; idWidth: string }>) {
  const { orgSlug, slug } = useProjectRoute()
  return (
    <BoardCardSubTicket
      status={
        <TicketStatusIcon
          status={ticket.status}
          orgSlug={orgSlug}
          slug={slug}
        />
      }
      ticketKey={ticket.id}
      keyWidth={idWidth}
      title={ticket.title}
      render={
        <Link
          to="/orgs/$orgSlug/projects/$slug/tickets/$id"
          params={{ orgSlug, slug, id: ticket.id }}
          preload="intent"
        />
      }
    />
  )
}
