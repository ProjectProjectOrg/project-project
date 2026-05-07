import { useAtomSet } from "@effect-atom/atom-react"
import { Check } from "lucide-react"
import { Hitbox } from "@/components/ui/hitbox"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger
} from "@/components/ui/dropdown-menu"
import { TYPE_META } from "@/lib/ticket-meta"
import {
  ticketKey,
  updateTicketAtom,
  type TicketConflict
} from "@/atoms/tickets"
import { cn } from "@/lib/utils"
import type { TicketId, TicketType } from "@projectproject/shared"

export function TypeBadgeTrigger({
  orgSlug,
  slug,
  ticket,
  className,
  onConflict
}: {
  orgSlug: string
  slug: string
  ticket: { id: TicketId; version: string; type: TicketType }
  className?: string
  onConflict?: (info: TicketConflict) => void
}) {
  const update = useAtomSet(
    updateTicketAtom(ticketKey(orgSlug, slug, ticket.id)),
    { mode: "promise" }
  )
  const meta = TYPE_META[ticket.type]
  const Icon = meta.icon
  const apply = async (next: TicketType) => {
    if (next === ticket.type) return
    const result = await update({
      baseVersion: ticket.version,
      type: next
    })
    if (result._tag === "Conflict") onConflict?.(result.conflict)
  }
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          onClick={(e) => e.stopPropagation()}
          aria-label={`Type: ${meta.label}. Click to change.`}
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
        align="end"
        sideOffset={6}
        className="w-40"
        onCloseAutoFocus={(e) => e.preventDefault()}
        onClick={(e) => e.stopPropagation()}
      >
        {(Object.keys(TYPE_META) as TicketType[]).map((t) => {
          const m = TYPE_META[t]
          const TIcon = m.icon
          return (
            <DropdownMenuItem
              key={t}
              onSelect={() => void apply(t)}
              className="cursor-pointer"
            >
              <TIcon className="size-4" strokeWidth={1.75} />
              {m.label}
              {t === ticket.type && (
                <Check className="ml-auto size-3.5 text-muted-foreground" />
              )}
            </DropdownMenuItem>
          )
        })}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

export function TypeButton({
  orgSlug,
  slug,
  ticket,
  className,
  onConflict
}: {
  orgSlug: string
  slug: string
  ticket: { id: TicketId; version: string; type: TicketType }
  className?: string
  onConflict?: (info: TicketConflict) => void
}) {
  const update = useAtomSet(
    updateTicketAtom(ticketKey(orgSlug, slug, ticket.id)),
    { mode: "promise" }
  )
  const meta = TYPE_META[ticket.type]
  const Icon = meta.icon
  const apply = async (next: TicketType) => {
    if (next === ticket.type) return
    const result = await update({
      baseVersion: ticket.version,
      type: next
    })
    if (result._tag === "Conflict") onConflict?.(result.conflict)
  }
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Hitbox
          mode="inline"
          margin="2"
          onClick={(e) => e.stopPropagation()}
          aria-label={`Type: ${meta.label}. Click to change.`}
          className={className}
        >
          <span className="inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-xs text-muted-foreground transition-colors group-hover/hitbox:bg-accent group-hover/hitbox:text-foreground">
            <Icon className="size-3.5" strokeWidth={1.75} />
            <span>{meta.label}</span>
          </span>
        </Hitbox>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="start"
        sideOffset={6}
        className="w-40"
        onClick={(e) => e.stopPropagation()}
      >
        {(Object.keys(TYPE_META) as TicketType[]).map((t) => {
          const m = TYPE_META[t]
          const TIcon = m.icon
          return (
            <DropdownMenuItem
              key={t}
              onSelect={() => void apply(t)}
              className="cursor-pointer"
            >
              <TIcon className="size-4" strokeWidth={1.75} />
              {m.label}
              {t === ticket.type && (
                <Check className="ml-auto size-3.5 text-muted-foreground" />
              )}
            </DropdownMenuItem>
          )
        })}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
