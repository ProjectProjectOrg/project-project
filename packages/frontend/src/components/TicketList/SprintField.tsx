import { useAtomSet, useAtomValue } from "@effect-atom/atom-react"
import { Plus, X } from "lucide-react"
import { useState } from "react"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger
} from "@/components/ui/dropdown-menu"
import { SprintStateDot } from "@/components/sprints/SprintChip"
import { Hitbox } from "@/components/ui/hitbox"
import { cn } from "@/lib/utils"
import { m } from "@/paraglide/messages"
import {
  addTicketsToSprintAtom,
  projectKey,
  removeTicketsFromSprintAtom,
  sprintsListAtom
} from "@/atoms/sprints"
import {
  pickActiveSprint,
  type Group,
  type TicketId
} from "@projectproject/shared"
import { Result } from "@effect-atom/atom-react"

const DATE_FMT = new Intl.DateTimeFormat(undefined, {
  month: "short",
  day: "numeric"
})

function rangeText(sprint: Group): string {
  if (!sprint.startsAt || !sprint.endsAt) return ""
  return `${DATE_FMT.format(sprint.startsAt)} – ${DATE_FMT.format(sprint.endsAt)}`
}

export function SprintField({
  orgSlug,
  slug,
  ticketId,
  membership,
  onRequestNewSprint
}: {
  orgSlug: string
  slug: string
  ticketId: TicketId
  membership: Group | null
  onRequestNewSprint?: () => void
}) {
  const key = projectKey(orgSlug, slug)
  const list = useAtomValue(sprintsListAtom(key))
  const addToSprint = useAtomSet(addTicketsToSprintAtom(key))
  const removeFromSprint = useAtomSet(
    removeTicketsFromSprintAtom(key)
  )
  const [open, setOpen] = useState(false)

  const sprints = Result.isSuccess(list) ? list.value : []
  const eligible = sprints.filter((s) => s.completedAt === null)

  const handleAssign = (groupId: Group["id"]) => {
    addToSprint({ groupId, ticketIds: [ticketId] })
    setOpen(false)
  }
  const handleRemove = () => {
    if (!membership) return
    removeFromSprint({
      groupId: membership.id,
      ticketIds: [ticketId]
    })
    setOpen(false)
  }

  return (
    <DropdownMenu open={open} onOpenChange={setOpen}>
      <DropdownMenuTrigger asChild>
        <Hitbox
          mode="inline"
          margin="2"
          onClick={(e) => e.stopPropagation()}
          aria-label={
            membership
              ? m.tickets_sprint_chip_aria({ name: membership.name })
              : m.tickets_assign_sprint_chip()
          }
          className={cn(
            "min-w-0",
            !membership &&
              "opacity-0 transition-opacity group-hover/list-row:opacity-100 focus-visible:opacity-100 data-[state=open]:opacity-100"
          )}
        >
          {membership ? (
            <span className="inline-flex max-w-[14ch] items-center gap-1.5 truncate text-xs text-muted-foreground transition-colors group-hover/hitbox:text-foreground">
              <SprintStateDot sprint={membership} />
              <span className="truncate">{membership.name}</span>
            </span>
          ) : (
            <span className="inline-flex items-center gap-1 text-xs text-muted-foreground transition-colors group-hover/hitbox:text-foreground">
              <Plus className="size-3" strokeWidth={1.75} />
              {m.tickets_assign_sprint_chip()}
            </span>
          )}
        </Hitbox>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="start"
        sideOffset={6}
        className="w-64"
        onClick={(e) => e.stopPropagation()}
        onCloseAutoFocus={(e) => e.preventDefault()}
      >
        {eligible.length === 0 ? (
          <div className="px-2 py-1.5 text-xs text-muted-foreground">
            {m.tickets_sprint_popover_empty()}
          </div>
        ) : (
          <>
            <div className="px-2 pt-1 pb-1.5 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
              {m.tickets_sprint_popover_title()}
            </div>
            {eligible.map((s) => {
              const isCurrent = membership?.id === s.id
              return (
                <DropdownMenuItem
                  key={s.id}
                  onSelect={(e) => {
                    e.preventDefault()
                    if (!isCurrent) handleAssign(s.id)
                  }}
                  className={cn(
                    "flex cursor-pointer items-center gap-2",
                    isCurrent && "bg-accent/40"
                  )}
                >
                  <SprintStateDot sprint={s} />
                  <span className="min-w-0 flex-1 truncate text-sm">
                    {s.name}
                  </span>
                  <span className="font-mono text-[11px] text-muted-foreground">
                    {rangeText(s)}
                  </span>
                </DropdownMenuItem>
              )
            })}
          </>
        )}
        <DropdownMenuSeparator />
        {onRequestNewSprint && (
          <DropdownMenuItem
            onSelect={(e) => {
              e.preventDefault()
              setOpen(false)
              onRequestNewSprint()
            }}
            className="cursor-pointer"
          >
            <Plus className="size-3.5" strokeWidth={1.75} />
            {m.tickets_sprint_popover_new_sprint_action()}
          </DropdownMenuItem>
        )}
        {membership && (
          <DropdownMenuItem
            onSelect={(e) => {
              e.preventDefault()
              handleRemove()
            }}
            className="cursor-pointer text-muted-foreground"
          >
            <X className="size-3.5" strokeWidth={1.75} />
            {m.tickets_sprint_popover_remove_action()}
          </DropdownMenuItem>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

export { pickActiveSprint }
