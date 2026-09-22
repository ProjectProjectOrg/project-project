import { Check } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Hitbox } from "@/components/ui/hitbox"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger
} from "@/components/ui/dropdown-menu"
import {
  PRIORITY_LABELS,
  PRIORITY_META,
  PRIORITY_ORDER
} from "@/lib/priority-meta"
import { m } from "@/paraglide/messages"
import { cn } from "@/lib/utils"
import type {
  TicketId,
  TicketPriority,
  UpdateTicketInput
} from "@projectproject/shared"

function PriorityMenuItems({
  current,
  onSelect
}: {
  current: TicketPriority
  onSelect: (priority: TicketPriority) => void
}) {
  return (
    <>
      {PRIORITY_ORDER.map((p) => {
        const pMeta = PRIORITY_META[p]
        const PIcon = pMeta.icon
        return (
          <DropdownMenuItem
            key={p}
            onClick={() => {
              if (p === current) return
              onSelect(p)
            }}
            className="cursor-pointer"
          >
            <PIcon
              className={cn("size-4", pMeta.className)}
              strokeWidth={1.75}
            />
            {PRIORITY_LABELS[p]()}
            {p === current && (
              <Check className="ml-auto size-3.5 text-muted-foreground" />
            )}
          </DropdownMenuItem>
        )
      })}
    </>
  )
}

export function PrioritySelect({
  value,
  onChange,
  stopPropagation
}: {
  value: TicketPriority
  onChange: (priority: TicketPriority) => void
  stopPropagation?: boolean
}) {
  const meta = PRIORITY_META[value]
  const Icon = meta.icon
  const priorityLabel = PRIORITY_LABELS[value]()
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <Hitbox
            mode="inline"
            margin="2"
            onClick={(e) => stopPropagation && e.stopPropagation()}
            aria-label={m.tickets_priority_aria_label({ label: priorityLabel })}
            title={priorityLabel}
          >
            <span
              className={cn(
                "grid size-6 place-items-center rounded-full transition-colors group-hover/hitbox:bg-foreground/5",
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
        <PriorityMenuItems current={value} onSelect={onChange} />
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

export function PriorityButton({
  ticket,
  stopPropagation,
  onPatch
}: {
  ticket: { id: TicketId; priority: TicketPriority }
  stopPropagation?: boolean
  onPatch: (patch: UpdateTicketInput) => void
}) {
  const meta = PRIORITY_META[ticket.priority]
  const Icon = meta.icon
  const priorityLabel = PRIORITY_LABELS[ticket.priority]()
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <Hitbox
            mode="inline"
            margin="2"
            onClick={(e) => stopPropagation && e.stopPropagation()}
            aria-label={m.tickets_priority_aria_label({ label: priorityLabel })}
            title={priorityLabel}
          >
            <span
              className={cn(
                "grid size-6 place-items-center rounded-full transition-colors group-hover/hitbox:bg-foreground/5",
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
        <PriorityMenuItems
          current={ticket.priority}
          onSelect={(priority) => onPatch({ priority })}
        />
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

export function PriorityBadgeTrigger({
  ticket,
  onPatch,
  className
}: {
  ticket: { id: TicketId; priority: TicketPriority }
  onPatch: (patch: UpdateTicketInput) => void
  className?: string
}) {
  const meta = PRIORITY_META[ticket.priority]
  const Icon = meta.icon
  const priorityLabel = PRIORITY_LABELS[ticket.priority]()
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <Button
            type="button"
            variant="chip"
            onClick={(e) => e.stopPropagation()}
            aria-label={m.tickets_priority_aria_label({ label: priorityLabel })}
            className={className}
          >
            <Icon
              className={cn("size-3.5", meta.className)}
              strokeWidth={1.75}
            />
            <span>{priorityLabel}</span>
          </Button>
        }
      />
      <DropdownMenuContent
        align="start"
        sideOffset={6}
        className="w-40"
        finalFocus={false}
        onClick={(e) => e.stopPropagation()}
      >
        <PriorityMenuItems
          current={ticket.priority}
          onSelect={(priority) => onPatch({ priority })}
        />
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
