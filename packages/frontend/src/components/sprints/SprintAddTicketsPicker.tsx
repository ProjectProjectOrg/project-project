import { Result, useAtomSet, useAtomValue } from "@effect-atom/atom-react"
import { Plus } from "lucide-react"
import { useState } from "react"
import { Button } from "@/components/ui/button"
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList
} from "@/components/ui/command"
import {
  Popover,
  PopoverContent,
  PopoverTrigger
} from "@/components/ui/popover"
import { cn } from "@/lib/utils"
import { m } from "@/paraglide/messages"
import {
  addTicketsToSprintAtom,
  projectKey,
  sprintsListAtom
} from "@/atoms/sprints"
import { ticketsListAtom, ticketsListKey } from "@/atoms/tickets"
import type { GroupId, Ticket, TicketId } from "@projectproject/shared"

export function SprintAddTicketsPicker({
  orgSlug,
  slug,
  groupId,
  excludeIds
}: {
  orgSlug: string
  slug: string
  groupId: GroupId
  excludeIds: ReadonlySet<TicketId>
}) {
  const projKey = projectKey(orgSlug, slug)
  const tickets = useAtomValue(ticketsListAtom(ticketsListKey(orgSlug, slug)))
  const sprints = useAtomValue(sprintsListAtom(projKey))
  const add = useAtomSet(addTicketsToSprintAtom(projKey))
  const [open, setOpen] = useState(false)
  const [selected, setSelected] = useState<ReadonlyArray<TicketId>>([])

  const memberOfOtherSprint = new Map<string, string>()
  if (Result.isSuccess(sprints)) {
    for (const s of sprints.value) {
      if (s.id === groupId) continue
      if (s.completedAt !== null) continue
      for (const tid of s.tickets) {
        if (!memberOfOtherSprint.has(tid)) memberOfOtherSprint.set(tid, s.name)
      }
    }
  }

  const allTickets: ReadonlyArray<Ticket> = Result.isSuccess(tickets)
    ? tickets.value.filter(
        (t) => t.status !== "done" && !excludeIds.has(t.id)
      )
    : []

  function toggle(id: TicketId) {
    setSelected((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    )
  }
  function submit() {
    if (selected.length === 0) {
      setOpen(false)
      return
    }
    add({ groupId, ticketIds: selected })
    setSelected([])
    setOpen(false)
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button type="button" variant="tertiary" size="sm" leadingIcon={Plus}>
          {m.sprints_add_tickets_button()}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-[28rem] p-0">
        <Command>
          <CommandInput
            placeholder={m.sprints_add_tickets_placeholder()}
          />
          <CommandList>
            <CommandEmpty>{m.sprints_add_tickets_empty()}</CommandEmpty>
            <CommandGroup>
              {allTickets.map((t) => {
                const inOther = memberOfOtherSprint.get(t.id)
                const isSelected = selected.includes(t.id)
                return (
                  <CommandItem
                    key={t.id}
                    value={`${t.id} ${t.title}`}
                    onSelect={() => toggle(t.id)}
                    className={cn(
                      "flex items-center gap-2",
                      isSelected && "bg-accent/40"
                    )}
                  >
                    <span
                      className={cn(
                        "grid size-4 shrink-0 place-items-center rounded border border-border",
                        isSelected && "border-foreground bg-foreground"
                      )}
                      aria-hidden
                    >
                      {isSelected && (
                        <span className="size-2 rounded-[1px] bg-background" />
                      )}
                    </span>
                    <span className="font-mono text-[11px] text-muted-foreground tabular-nums">
                      {t.id}
                    </span>
                    <span className="min-w-0 flex-1 truncate text-sm">
                      {t.title}
                    </span>
                    {inOther && (
                      <span className="font-mono text-[10px] text-muted-foreground">
                        {m.sprints_add_tickets_in_other_sprint({
                          name: inOther
                        })}
                      </span>
                    )}
                  </CommandItem>
                )
              })}
            </CommandGroup>
          </CommandList>
          <div className="flex items-center justify-between gap-2 border-t border-border p-2">
            <span className="text-xs text-muted-foreground">
              {m.sprints_add_tickets_selected_count({
                count: selected.length
              })}
            </span>
            <div className="flex gap-1">
              <Button
                type="button"
                size="xs"
                variant="tertiary"
                onClick={() => {
                  setSelected([])
                  setOpen(false)
                }}
              >
                {m.common_cancel_button()}
              </Button>
              <Button
                type="button"
                size="xs"
                variant="primary"
                disabled={selected.length === 0}
                onClick={submit}
              >
                {m.sprints_add_tickets_submit({ count: selected.length })}
              </Button>
            </div>
          </div>
        </Command>
      </PopoverContent>
    </Popover>
  )
}
