import { useAtomSet } from "@effect-atom/atom-react"
import { Check } from "lucide-react"
import { Hitbox } from "@/components/ui/hitbox"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger
} from "@/components/ui/dropdown-menu"
import { STATUS_LABELS, STATUS_META } from "@/lib/ticket-meta"
import { m } from "@/paraglide/messages"
import { updateTicketAtom } from "@/atoms/tickets"
import { cn } from "@/lib/utils"
import type { TicketId, TicketStatus } from "@projectproject/shared"

export function StatusButton({
  orgSlug,
  slug,
  ticket,
  stopPropagation
}: {
  orgSlug: string
  slug: string
  ticket: { id: TicketId; status: TicketStatus }
  stopPropagation?: boolean
}) {
  const update = useAtomSet(updateTicketAtom)
  const meta = STATUS_META[ticket.status]
  const Icon = meta.icon
  const statusLabel = STATUS_LABELS[ticket.status]()
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <Hitbox
            mode="inline"
            margin="2"
            onClick={(e) => stopPropagation && e.stopPropagation()}
            aria-label={m.tickets_status_aria_label({ label: statusLabel })}
            title={statusLabel}
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
        }
      />
      <DropdownMenuContent
        align="start"
        sideOffset={6}
        className="w-44"
        onClick={(e) => e.stopPropagation()}
      >
        {(Object.keys(STATUS_META) as TicketStatus[]).map((status) => {
          const sMeta = STATUS_META[status]
          const SIcon = sMeta.icon
          return (
            <DropdownMenuItem
              key={status}
              onSelect={() => {
                if (status === ticket.status) return
                update({ orgSlug, slug, id: ticket.id, status })
              }}
              className="cursor-pointer"
            >
              <SIcon
                className={cn("size-4", sMeta.className)}
                strokeWidth={1.75}
              />
              {STATUS_LABELS[status]()}
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
