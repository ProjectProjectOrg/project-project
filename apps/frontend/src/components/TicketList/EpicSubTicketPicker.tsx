import type { Ticket, TicketId } from "@pp/shared"
import * as Result from "effect/unstable/reactivity/AsyncResult"
import { Check } from "lucide-react"
import { motion } from "motion/react"

import { ErrorPage } from "@/components/ErrorPage"
import { Button } from "@/components/ui/button"
import { Kbd } from "@/components/ui/kbd"
import { transitions } from "@/lib/springs"
import { cn } from "@/lib/utils"
import { m } from "@/paraglide/messages"

const keepFocus = (e: React.MouseEvent) => e.preventDefault()

const ROW_STAGGER = 0.025

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
