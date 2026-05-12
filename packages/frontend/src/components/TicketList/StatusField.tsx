import { useAtomSet } from "@effect-atom/atom-react"
import { Check } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Hitbox } from "@/components/ui/hitbox"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger
} from "@/components/ui/dropdown-menu"
import { STATUS_LABELS, STATUS_META } from "@/lib/ticket-meta"
import { m } from "@/paraglide/messages"
import { ticketKey, updateTicketAtom } from "@/atoms/tickets"
import { cn } from "@/lib/utils"
import type { TicketId, TicketStatus } from "@projectproject/shared"

function StatusMenuItems({
  current,
  onSelect
}: {
  current: TicketStatus
  onSelect: (next: TicketStatus) => void
}) {
  return (
    <>
      {(Object.keys(STATUS_META) as TicketStatus[]).map((status) => {
        const sMeta = STATUS_META[status]
        const SIcon = sMeta.icon
        return (
          <DropdownMenuItem
            key={status}
            onClick={() => {
              if (status === current) return
              onSelect(status)
            }}
            className="cursor-pointer"
          >
            <SIcon
              className={cn("size-4", sMeta.className)}
              strokeWidth={1.75}
            />
            {STATUS_LABELS[status]()}
            {status === current && (
              <Check className="ml-auto size-3.5 text-muted-foreground" />
            )}
          </DropdownMenuItem>
        )
      })}
    </>
  )
}

export function StatusBadgeTrigger({
  orgSlug,
  slug,
  ticket,
  className
}: {
  orgSlug: string
  slug: string
  ticket: { id: TicketId; status: TicketStatus }
  className?: string
}) {
  const update = useAtomSet(
    updateTicketAtom(ticketKey(orgSlug, slug, ticket.id))
  )
  const meta = STATUS_META[ticket.status]
  const Icon = meta.icon
  const statusLabel = STATUS_LABELS[ticket.status]()
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <Button
            type="button"
            variant="chip"
            onClick={(e) => e.stopPropagation()}
            aria-label={m.tickets_status_aria_label({ label: statusLabel })}
            className={className}
          >
            <Icon
              className={cn("size-3.5", meta.className)}
              strokeWidth={1.75}
            />
            <span>{statusLabel}</span>
          </Button>
        }
      />
      <DropdownMenuContent
        align="start"
        sideOffset={6}
        className="w-44"
        finalFocus={false}
        onClick={(e) => e.stopPropagation()}
      >
        <StatusMenuItems
          current={ticket.status}
          onSelect={(status) => update({ status })}
        />
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

export function StatusButton({
  orgSlug,
  slug,
  ticket,
  stopPropagation,
  size = "sm"
}: {
  orgSlug: string
  slug: string
  ticket: { id: TicketId; status: TicketStatus }
  stopPropagation?: boolean
  size?: "sm" | "lg"
}) {
  const update = useAtomSet(
    updateTicketAtom(ticketKey(orgSlug, slug, ticket.id))
  )
  const meta = STATUS_META[ticket.status]
  const Icon = meta.icon
  const statusLabel = STATUS_LABELS[ticket.status]()
  const wrapperClass =
    size === "lg"
      ? "grid size-10 place-items-center rounded-lg bg-muted transition-colors group-hover/hitbox:bg-accent"
      : cn(
          "grid size-6 place-items-center rounded-full transition-colors group-hover/hitbox:bg-accent",
          meta.className
        )
  const iconClass =
    size === "lg" ? cn("size-5", meta.className) : "size-4"
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <Hitbox
            mode="inline"
            margin={size === "lg" ? "1" : "2"}
            onClick={(e) => stopPropagation && e.stopPropagation()}
            aria-label={m.tickets_status_aria_label({ label: statusLabel })}
            title={statusLabel}
          >
            <span className={wrapperClass}>
              <Icon className={iconClass} strokeWidth={1.75} />
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
        <StatusMenuItems
          current={ticket.status}
          onSelect={(status) => update({ status })}
        />
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
