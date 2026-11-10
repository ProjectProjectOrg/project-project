import { RegistryContext, useAtomValue } from "@effect/atom-react"
import { hasSubTickets, type Ticket, type TicketId } from "@pp/shared"
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
import { transitions } from "@/lib/springs"
import { cn } from "@/lib/utils"
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
          <div className="pt-1.5">
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
    <ul className="grid grid-cols-[auto_auto_minmax(0,1fr)] border-t border-border/60 pt-1">
      {status !== null ? (
        <li
          className={cn(
            "col-span-full px-1 py-1 text-caption text-muted-foreground",
            Result.isInitial(result) && "animate-pulse"
          )}
        >
          {status}
        </li>
      ) : (
        <ChildLines rows={Result.getOrElse(result, () => [])} />
      )}
    </ul>
  )
}

const PREVIEW_COUNT = 3

const bleedHover =
  "transition-colors before:absolute before:inset-y-0 before:-inset-x-1.5 before:-z-10 before:rounded-sm before:content-[''] before:[transition:inherit] hover:before:bg-hover"

function ChildLines({
  rows
}: Readonly<{
  rows: ReadonlyArray<TicketRow>
}>) {
  const [showAll, setShowAll] = useState(false)
  const heightReveal = useHeightReveal()
  const hidden = rows.length - PREVIEW_COUNT
  const idWidth = `${Math.max(...rows.map((row) => row.ticket.id.length))}ch`
  const line = (row: TicketRow) => (
    <ChildLine key={row.key} ticket={row.ticket} idWidth={idWidth} />
  )
  return (
    <>
      {rows.slice(0, PREVIEW_COUNT).map(line)}
      <AnimatePresence initial={false}>
        {showAll && hidden > 0 && (
          <motion.li
            {...heightReveal}
            className="col-span-full grid grid-cols-subgrid overflow-y-clip"
          >
            <ul className="contents">{rows.slice(PREVIEW_COUNT).map(line)}</ul>
          </motion.li>
        )}
      </AnimatePresence>
      {hidden > 0 && (
        <li className="col-span-full">
          <button
            type="button"
            draggable={false}
            onMouseDown={(event) => event.preventDefault()}
            onClick={(event) => {
              event.stopPropagation()
              setShowAll((all) => !all)
            }}
            className={cn(
              "flex h-7 w-full items-center pl-7.5 text-caption text-muted-foreground outline-none hover:text-foreground focus-visible:before:ring-1 focus-visible:before:ring-ring focus-visible:before:ring-inset",
              bleedHover
            )}
          >
            {showAll
              ? m.tickets_sub_tickets_show_less()
              : m.tickets_sub_tickets_show_more({ count: hidden })}
          </button>
        </li>
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
    <li
      className={cn(
        "relative z-20 col-span-full grid h-7 grid-cols-subgrid items-center gap-x-2 pr-2 text-caption",
        bleedHover
      )}
    >
      <span className="grid w-[22px] place-items-center">
        <TicketStatusIcon
          status={ticket.status}
          orgSlug={orgSlug}
          slug={slug}
        />
      </span>
      <span
        style={{ minWidth: idWidth }}
        className="shrink-0 font-mono text-muted-foreground tabular-nums"
      >
        {ticket.id}
      </span>
      <Link
        to="/orgs/$orgSlug/projects/$slug/tickets/$id"
        params={{ orgSlug, slug, id: ticket.id }}
        preload="intent"
        draggable={false}
        data-row-link
        title={ticket.title}
        className="min-w-0 truncate outline-none after:absolute after:inset-y-0 after:-inset-x-1.5 after:rounded-sm after:content-[''] focus-visible:after:ring-1 focus-visible:after:ring-ring focus-visible:after:ring-inset"
      >
        {ticket.title}
      </Link>
    </li>
  )
}
