import { isEpic, type Member, type Ticket } from "@pp/shared"
import { ChevronRight, Plus } from "@pp/ui/icons"
import { transitions } from "@pp/ui/lib/springs"
import { cn } from "@pp/ui/lib/utils"
import { useHotkey } from "@tanstack/react-hotkeys"
import { AnimatePresence, m as motion, useReducedMotion } from "motion/react"
import { useState, type ReactNode } from "react"

import { CommentsSection } from "@/features/comments/components/CommentsSection"
import { useChildTicketCount } from "@/features/tickets/hooks/useChildTicketCount"
import { appHotkeys } from "@/lib/appHotkeys"
import { m } from "@/paraglide/messages"

import { AddChildTicketButton } from "./AddChildTicketButton"
import { ChildTicketList } from "./ChildTicketList"
import { SubTicketComposer } from "./SubTicketComposer"

type Props = Readonly<{
  ticket: Ticket
  members: ReadonlyArray<Member>
  editable: boolean
  holdsChildren: boolean
}>

export function TicketDiscussion({
  ticket,
  members,
  editable,
  holdsChildren
}: Props) {
  return (
    <>
      {holdsChildren && (
        <ChildrenSection
          parent={ticket}
          members={members}
          editable={editable}
        />
      )}
      <CommentsSection ticketId={ticket.id} />
    </>
  )
}

function ChildrenSection({
  parent,
  members,
  editable
}: Readonly<{
  parent: Ticket
  members: ReadonlyArray<Member>
  editable: boolean
}>) {
  const count = useChildTicketCount(parent)
  const [open, setOpen] = useState(true)
  const [adding, setAdding] = useState(false)
  const startAdding = () => {
    setOpen(true)
    setAdding(true)
  }
  useHotkey(appHotkeys["tickets.add-sub-ticket"], startAdding, {
    enabled: editable && !adding
  })

  const empty = editable && count === 0
  const expanded = empty ? adding : open
  const epic = isEpic(parent)
  const heading = empty
    ? epic
      ? m.tickets_children_add_tickets()
      : m.tickets_children_add_sub_tickets()
    : epic
      ? m.tickets_epic_tickets_heading()
      : m.tickets_sub_tickets_heading()

  return (
    <section className="flex flex-col border-b border-border/60 pb-4">
      {/* oxlint-disable-next-line shadcn/no-arbitrary-values -- lines the heading up with the ticket's boxes */}
      <div className="flex items-center gap-1 pl-[calc(var(--ticket-box-offset)-0.5rem)]">
        <h2>
          {/* The section's heading, so a plain button in the title's type
              with the ghost button's hover, not a restyled Button. */}
          <button
            type="button"
            aria-expanded={expanded}
            onClick={() =>
              empty ? setAdding((current) => !current) : setOpen(!open)
            }
            className="group focus-ring inline-flex h-7 cursor-pointer items-center gap-1.5 rounded-md px-2 text-title-compact/5 text-muted-foreground transition-colors outline-none [corner-shape:var(--button-corner)] hover:bg-hover hover:text-foreground"
          >
            {empty && (
              <Plus className="size-3.5" strokeWidth={1.75} aria-hidden />
            )}
            <span className={cn(!empty && "text-foreground")}>{heading}</span>
            {count > 0 && <span className="tabular-nums">{count}</span>}
            {!empty && (
              <ChevronRight
                className="size-3.5 transition-transform group-aria-expanded:rotate-90"
                strokeWidth={1.75}
                aria-hidden
              />
            )}
          </button>
        </h2>
        {editable && !empty && (
          <AddChildTicketButton
            parent={parent}
            onCreate={startAdding}
            className="mr-2 ml-auto"
          />
        )}
      </div>
      <AnimatePresence initial={false}>
        <Collapse key="list" open={open}>
          <div className="flex flex-col pt-2">
            <ChildTicketList
              parent={parent}
              members={members}
              editable={editable}
            />
          </div>
        </Collapse>
        {open && adding && (
          <Collapse key="composer" open>
            <div className="pt-2">
              <SubTicketComposer
                parent={parent}
                onClose={() => setAdding(false)}
              />
            </div>
          </Collapse>
        )}
      </AnimatePresence>
    </section>
  )
}

function Collapse({
  open,
  children
}: Readonly<{ open: boolean; children: ReactNode }>) {
  const reduce = useReducedMotion() ?? false
  return (
    <motion.div
      layout
      style={{ height: open ? "auto" : 0, originY: 0 }}
      initial={{ opacity: 0 }}
      animate={{ opacity: open ? 1 : 0 }}
      exit={{ opacity: 0 }}
      transition={reduce ? { duration: 0 } : transitions.morph}
      inert={!open}
      className="overflow-hidden"
    >
      {children}
    </motion.div>
  )
}
