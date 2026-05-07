import { useAtomSet } from "@effect-atom/atom-react"
import { Check } from "lucide-react"
import { Hitbox } from "@/components/ui/hitbox"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger
} from "@/components/ui/dropdown-menu"
import { STATUS_META } from "@/lib/ticket-meta"
import {
  ticketKey,
  updateTicketAtom,
  type TicketConflict
} from "@/atoms/tickets"
import { cn } from "@/lib/utils"
import type { TicketId, TicketStatus } from "@projectproject/shared"

export function StatusButton({
  orgSlug,
  slug,
  ticket,
  stopPropagation,
  onConflict
}: {
  orgSlug: string
  slug: string
  ticket: { id: TicketId; version: string; status: TicketStatus }
  stopPropagation?: boolean
  onConflict?: (info: TicketConflict) => void
}) {
  const update = useAtomSet(
    updateTicketAtom(ticketKey(orgSlug, slug, ticket.id)),
    { mode: "promise" }
  )
  const meta = STATUS_META[ticket.status]
  const Icon = meta.icon
  const apply = async (next: TicketStatus) => {
    if (next === ticket.status) return
    const result = await update({
      baseVersion: ticket.version,
      status: next
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
          aria-label={`Status: ${meta.label}. Click to change.`}
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
        {(Object.keys(STATUS_META) as TicketStatus[]).map((status) => {
          const m = STATUS_META[status]
          const SIcon = m.icon
          return (
            <DropdownMenuItem
              key={status}
              onSelect={() => void apply(status)}
              className="cursor-pointer"
            >
              <SIcon className={cn("size-4", m.className)} strokeWidth={1.75} />
              {m.label}
              {status === ticket.status && (
                <Check className="ml-auto size-3.5 text-muted-foreground" />
              )}
            </DropdownMenuItem>
          )
        })}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
