import { useAtomValue } from "@effect/atom-react"
import type { Ticket, TicketId } from "@pp/shared"
import * as Result from "effect/reactivity/AsyncResult"
import * as Atom from "effect/reactivity/Atom"
import { Check } from "lucide-react"
import { motion } from "motion/react"
import { useState, type KeyboardEvent } from "react"

import { ErrorPage } from "@/components/shell/ErrorPage"
import { Button } from "@/components/ui/button"
import { Kbd } from "@/components/ui/kbd"
import { useProjectRoute } from "@/features/projects/hooks/useProject"
import { subTickets, subTicketsRequest } from "@/features/tickets/atoms/epics"
import type { TicketRow } from "@/features/tickets/lib/ticketRows"
import { transitions } from "@/lib/springs"
import { cn } from "@/lib/utils"
import { m } from "@/paraglide/messages"

const keepFocus = (e: React.MouseEvent) => e.preventDefault()

const ROW_STAGGER = 0.025

const idleSubTicketsAtom = Atom.make(Result.initial<ReadonlyArray<TicketRow>>())

export function useEpicPicker(inSprint: ReadonlySet<TicketId>) {
  const { orgSlug, slug } = useProjectRoute()
  const [epic, setEpic] = useState<Ticket | null>(null)
  const [deselected, setDeselected] = useState<ReadonlySet<TicketId>>(
    () => new Set()
  )
  const [cursor, setCursor] = useState(0)
  const rows = useAtomValue(
    epic === null
      ? idleSubTicketsAtom
      : subTickets(subTicketsRequest(orgSlug, slug, epic.id))
  )
  const tickets = Result.isSuccess(rows)
    ? rows.value.map((row) => row.ticket).filter((t) => t.status !== "done")
    : null
  const toggleable = tickets?.filter((t) => !inSprint.has(t.id)) ?? []
  const selection = toggleable.filter((t) => !deselected.has(t.id))

  const toggle = (id: TicketId) => {
    if (inSprint.has(id)) return
    setDeselected((current) => {
      const next = new Set(current)
      if (!next.delete(id)) next.add(id)
      return next
    })
  }

  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Escape") {
      e.preventDefault()
      setEpic(null)
    } else if (e.key === "ArrowDown" && toggleable.length > 0) {
      e.preventDefault()
      setCursor((c) => (c + 1) % toggleable.length)
    } else if (e.key === "ArrowUp" && toggleable.length > 0) {
      e.preventDefault()
      setCursor((c) => (c - 1 + toggleable.length) % toggleable.length)
    } else if (e.key === " " && toggleable[cursor]) {
      e.preventDefault()
      toggle(toggleable[cursor].id)
    }
  }

  return {
    epic,
    open: (next: Ticket) => {
      setEpic(next)
      setDeselected(new Set())
      setCursor(0)
    },
    close: () => setEpic(null),
    selection,
    onKeyDown,
    pickerProps: {
      tickets,
      failure: Result.isFailure(rows) ? rows : null,
      inSprint,
      deselected,
      cursorId: toggleable[cursor]?.id ?? null,
      onToggle: toggle,
      onHover: (id: TicketId) => {
        const index = toggleable.findIndex((t) => t.id === id)
        if (index >= 0) setCursor(index)
      },
      onCancel: () => setEpic(null)
    }
  }
}

export function EpicSubTicketPicker({
  tickets,
  failure,
  inSprint,
  deselected,
  cursorId,
  onToggle,
  onHover,
  onAdd,
  onCancel
}: Readonly<{
  tickets: ReadonlyArray<Ticket> | null
  failure: Result.Failure<unknown, unknown> | null
  inSprint: ReadonlySet<TicketId>
  deselected: ReadonlySet<TicketId>
  cursorId: TicketId | null
  onToggle: (id: TicketId) => void
  onHover: (id: TicketId) => void
  onAdd: () => void
  onCancel: () => void
}>) {
  const count =
    tickets?.filter((t) => !inSprint.has(t.id) && !deselected.has(t.id))
      .length ?? 0
  return (
    <motion.div
      initial={{ height: 0, opacity: 0 }}
      animate={{ height: "auto", opacity: 1 }}
      exit={{ height: 0, opacity: 0 }}
      transition={transitions.layout}
      className="overflow-hidden"
    >
      <div className="my-1 mr-1 ml-[15px] flex flex-col border-l border-border pl-2">
        {failure !== null ? (
          Result.matchWithError(failure, {
            onInitial: () => null,
            onSuccess: () => null,
            onError: (error) => <ErrorPage error={error} contained />,
            onDefect: (defect) => <ErrorPage error={defect} contained />
          })
        ) : tickets === null ? (
          <div
            aria-busy="true"
            className="my-1 h-7 animate-pulse rounded-md bg-muted/60 motion-reduce:animate-none"
          />
        ) : tickets.length === 0 ? (
          <p className="px-2 py-1.5 text-sm text-muted-foreground">
            {m.sprints_add_epic_empty()}
          </p>
        ) : (
          tickets.map((ticket, index) => {
            const locked = inSprint.has(ticket.id)
            const checked = locked || !deselected.has(ticket.id)
            return (
              <motion.button
                key={ticket.id}
                type="button"
                aria-pressed={checked}
                disabled={locked}
                initial={{ opacity: 0, y: -4 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ ...transitions.fade, delay: index * ROW_STAGGER }}
                onMouseDown={keepFocus}
                onMouseEnter={() => onHover(ticket.id)}
                onClick={() => onToggle(ticket.id)}
                className={cn(
                  "flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm transition-colors",
                  ticket.id === cursorId
                    ? "bg-accent text-foreground"
                    : "text-muted-foreground",
                  locked && "cursor-default"
                )}
              >
                <span
                  aria-hidden
                  className={cn(
                    "grid size-4 shrink-0 place-items-center rounded-[5px] border transition-colors",
                    checked
                      ? "border-primary bg-primary text-primary-foreground"
                      : "border-border",
                    locked && "opacity-40"
                  )}
                >
                  {checked && <Check className="size-3" strokeWidth={2.5} />}
                </span>
                <span className="font-mono text-[11px] tabular-nums">
                  {ticket.id}
                </span>
                <span
                  className={cn(
                    "min-w-0 flex-1 truncate transition-colors",
                    locked
                      ? "text-muted-foreground"
                      : checked
                        ? "text-foreground"
                        : "text-muted-foreground line-through decoration-muted-foreground/40"
                  )}
                >
                  {ticket.title}
                </span>
                {locked && (
                  <span className="shrink-0 text-[11px] text-muted-foreground">
                    {m.sprints_add_epic_in_sprint()}
                  </span>
                )}
              </motion.button>
            )
          })
        )}
        <div className="flex items-center justify-between gap-2 px-2 pt-2 pb-1">
          <span className="flex items-center gap-1 text-[11px] text-muted-foreground">
            <Kbd size="sm">↑↓</Kbd>
            <Kbd size="sm">{m.sprints_add_epic_key_space()}</Kbd>
            <span className="ml-0.5">{m.sprints_add_epic_toggle_hint()}</span>
          </span>
          <div className="flex items-center gap-1.5">
            <Button
              type="button"
              size="xs"
              variant="ghost"
              onMouseDown={keepFocus}
              onClick={onCancel}
            >
              {m.sprints_add_epic_cancel()}
              <Kbd size="sm">{m.sprints_add_epic_key_escape()}</Kbd>
            </Button>
            <Button
              type="button"
              size="xs"
              variant="primary"
              disabled={count === 0}
              onMouseDown={keepFocus}
              onClick={onAdd}
            >
              {m.sprints_add_epic_action({ count })}
              <Kbd size="sm" className="bg-primary-foreground/15 text-inherit">
                ↵
              </Kbd>
            </Button>
          </div>
        </div>
      </div>
    </motion.div>
  )
}
