import { isEpic, type Member, type Ticket } from "@pp/shared"
import { ChevronRight, Plus } from "lucide-react"
import { AnimatePresence, motion, useReducedMotion } from "motion/react"
import { useEffect, useState, type ReactNode } from "react"

import { Button } from "@/components/ui/button"
import { CommentsSection } from "@/features/comments/components/CommentsSection"
import { useChildTicketCount } from "@/features/tickets/hooks/useChildTicketCount"
import { ownsKeystrokes } from "@/lib/keyboard"
import { transitions } from "@/lib/springs"
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
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (!editable || adding || event.defaultPrevented) return
      if (event.metaKey || event.ctrlKey || event.altKey) return
      if (event.key !== "c" || ownsKeystrokes(event.target)) return
      event.preventDefault()
      setOpen(true)
      setAdding(true)
    }
    document.addEventListener("keydown", onKey)
    return () => document.removeEventListener("keydown", onKey)
  }, [editable, adding])

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
      <div className="flex items-center gap-1 pl-[calc(var(--ticket-box-offset)-0.5rem)]">
        <h2>
          <Button
            type="button"
            variant="chip-muted"
            aria-expanded={expanded}
            onClick={() =>
              empty ? setAdding((current) => !current) : setOpen(!open)
            }
            className="h-7 gap-1.5 px-2 text-subtitle-compact motion-safe:active:scale-100"
          >
            {empty && (
              <Plus className="size-3.5" strokeWidth={1.75} aria-hidden />
            )}
            {heading}
            {count > 0 && <span className="tabular-nums">{count}</span>}
            {!empty && (
              <ChevronRight
                className="size-3.5 transition-transform group-aria-expanded:rotate-90"
                strokeWidth={1.75}
                aria-hidden
              />
            )}
          </Button>
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
      initial={{ height: 0, opacity: 0 }}
      animate={
        open ? { height: "auto", opacity: 1 } : { height: 0, opacity: 0 }
      }
      exit={{ height: 0, opacity: 0 }}
      transition={reduce ? { duration: 0 } : transitions.morph}
      inert={!open}
      className="overflow-hidden"
    >
      {children}
    </motion.div>
  )
}
