import { Plus } from "lucide-react"

import { Button } from "@/components/ui/button"
import { m } from "@/paraglide/messages"

type Props = Readonly<{
  label: string
  ticketCount: number
  onAdd: (() => void) | null
}>

export function StatusPhaseHeader({ label, ticketCount, onAdd }: Props) {
  return (
    <div className="flex h-8 items-center justify-between gap-2 bg-foreground/[0.03] pr-2 pl-4">
      <span className="flex items-baseline gap-1.5 text-xs">
        <span className="font-medium text-muted-foreground">{label}</span>
        <span className="text-muted-foreground/60">
          {m.tickets_status_phase_ticket_count({ count: ticketCount })}
        </span>
      </span>
      {onAdd ? (
        <Button
          type="button"
          variant="quiet"
          size="square-7"
          className="size-6"
          aria-label={m.tickets_status_create_add_to({ phase: label })}
          onClick={onAdd}
        >
          <Plus className="size-4" />
        </Button>
      ) : null}
    </div>
  )
}
