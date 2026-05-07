import { useAtomSet } from "@effect-atom/atom-react"
import { Check } from "lucide-react"
import { Hitbox } from "@/components/ui/hitbox"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger
} from "@/components/ui/dropdown-menu"
import { PRIORITY_META, PRIORITY_ORDER } from "@/lib/priority-meta"
import {
  ticketKey,
  updateTicketAtom,
  type TicketConflict
} from "@/atoms/tickets"
import { cn } from "@/lib/utils"
import type { TicketId, TicketPriority } from "@projectproject/shared"

export function PriorityButton({
  orgSlug,
  slug,
  ticket,
  stopPropagation,
  onConflict
}: {
  orgSlug: string
  slug: string
  ticket: { id: TicketId; version: string; priority: TicketPriority }
  stopPropagation?: boolean
  onConflict?: (info: TicketConflict) => void
}) {
  const update = useAtomSet(
    updateTicketAtom(ticketKey(orgSlug, slug, ticket.id)),
    { mode: "promise" }
  )
  const meta = PRIORITY_META[ticket.priority]
  const Icon = meta.icon
  const apply = async (next: TicketPriority) => {
    if (next === ticket.priority) return
    const result = await update({
      baseVersion: ticket.version,
      priority: next
    })
    if (result._tag === "Conflict") onConflict?.(result.conflict)
  }
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Hitbox
          mode="inline"
          margin="2"
          onClick={(e) => stopPropagation && e.stopPropagation()}
          aria-label={`Priority: ${meta.label}. Click to change.`}
          title={meta.label}
        >
          <span
            className={cn(
              "grid size-6 place-items-center rounded-full transition-colors group-hover/hitbox:bg-accent",
              meta.className
            )}
          >
            <Icon className="size-4" strokeWidth={1.75} />
          </span>
        </Hitbox>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="start"
        sideOffset={6}
        className="w-44"
        onClick={(e) => e.stopPropagation()}
      >
        {PRIORITY_ORDER.map((p) => {
          const m = PRIORITY_META[p]
          const PIcon = m.icon
          return (
            <DropdownMenuItem
              key={p}
              onSelect={() => void apply(p)}
              className="cursor-pointer"
            >
              <PIcon className={cn("size-4", m.className)} strokeWidth={1.75} />
              {m.label}
              {p === ticket.priority && (
                <Check className="ml-auto size-3.5 text-muted-foreground" />
              )}
            </DropdownMenuItem>
          )
        })}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

export function PriorityBadgeTrigger({
  orgSlug,
  slug,
  ticket,
  className,
  onConflict
}: {
  orgSlug: string
  slug: string
  ticket: { id: TicketId; version: string; priority: TicketPriority }
  className?: string
  onConflict?: (info: TicketConflict) => void
}) {
  const update = useAtomSet(
    updateTicketAtom(ticketKey(orgSlug, slug, ticket.id)),
    { mode: "promise" }
  )
  const meta = PRIORITY_META[ticket.priority]
  const Icon = meta.icon
  const apply = async (next: TicketPriority) => {
    if (next === ticket.priority) return
    const result = await update({
      baseVersion: ticket.version,
      priority: next
    })
    if (result._tag === "Conflict") onConflict?.(result.conflict)
  }
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          onClick={(e) => e.stopPropagation()}
          aria-label={`Priority: ${meta.label}. Click to change.`}
          className={cn(
            "inline-flex items-center gap-1.5 rounded-md px-1.5 py-0.5 transition-colors hover:bg-accent hover:text-foreground",
            className
          )}
        >
          <Icon className="size-3.5" strokeWidth={1.75} />
          <span>{meta.label}</span>
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="start"
        sideOffset={6}
        className="w-40"
        onCloseAutoFocus={(e) => e.preventDefault()}
        onClick={(e) => e.stopPropagation()}
      >
        {PRIORITY_ORDER.map((p) => {
          const m = PRIORITY_META[p]
          const PIcon = m.icon
          return (
            <DropdownMenuItem
              key={p}
              onSelect={() => void apply(p)}
              className="cursor-pointer"
            >
              <PIcon className={cn("size-4", m.className)} strokeWidth={1.75} />
              {m.label}
              {p === ticket.priority && (
                <Check className="ml-auto size-3.5 text-muted-foreground" />
              )}
            </DropdownMenuItem>
          )
        })}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
