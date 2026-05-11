import { useAtomSet, useAtomValue } from "@effect-atom/atom-react"
import { Plus } from "lucide-react"
import { useState } from "react"
import { SprintStateIcon } from "@/components/sprints/SprintChip"
import { SprintAssignMenu } from "@/components/sprints/SprintAssignMenu"
import { Button } from "@/components/ui/button"
import { Hitbox } from "@/components/ui/hitbox"
import { cn } from "@/lib/utils"
import { m } from "@/paraglide/messages"
import {
  addTicketsToSprintAtom,
  projectKey,
  removeTicketsFromSprintAtom,
  sprintMembershipAtom,
  sprintsListAtom
} from "@/atoms/sprints"
import { type Group, type TicketId } from "@projectproject/shared"
import { Result } from "@effect-atom/atom-react"

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
  const removeFromSprint = useAtomSet(removeTicketsFromSprintAtom(key))
  const [open, setOpen] = useState(false)

  const sprints = Result.isSuccess(list) ? list.value : []
  const hasAnyEligible = sprints.some((s) => s.completedAt === null)
  if (!hasAnyEligible) return null

  return (
    <SprintAssignMenu
      open={open}
      onOpenChange={setOpen}
      sprints={sprints}
      selectedId={membership?.id ?? null}
      onSelect={(s) => addToSprint({ groupId: s.id, ticketIds: [ticketId] })}
      onClear={
        membership
          ? () =>
              removeFromSprint({
                groupId: membership.id,
                ticketIds: [ticketId]
              })
          : undefined
      }
      onRequestNewSprint={onRequestNewSprint}
      trigger={
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
            <span className="inline-flex max-w-[14ch] items-center gap-1 rounded-md px-1.5 py-0.5 text-xs text-muted-foreground transition-colors group-hover/hitbox:bg-accent group-hover/hitbox:text-foreground">
              <SprintStateIcon sprint={membership} size="xs" />
              <span className="truncate">{membership.name}</span>
            </span>
          ) : (
            <span className="inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-xs text-muted-foreground transition-colors group-hover/hitbox:bg-accent group-hover/hitbox:text-foreground">
              <Plus className="size-3" strokeWidth={1.75} />
              {m.tickets_assign_sprint_chip()}
            </span>
          )}
        </Hitbox>
      }
    />
  )
}

export function SprintBadgeTrigger({
  orgSlug,
  slug,
  ticketId,
  className
}: {
  orgSlug: string
  slug: string
  ticketId: TicketId
  className?: string
}) {
  const key = projectKey(orgSlug, slug)
  const list = useAtomValue(sprintsListAtom(key))
  const membership = useAtomValue(sprintMembershipAtom(key))
  const addToSprint = useAtomSet(addTicketsToSprintAtom(key))
  const removeFromSprint = useAtomSet(removeTicketsFromSprintAtom(key))
  const [open, setOpen] = useState(false)
  const sprints = Result.isSuccess(list) ? list.value : []
  const hasAnyEligible = sprints.some((s) => s.completedAt === null)
  const current = membership?.get(ticketId) ?? null
  const label = current?.name ?? m.tickets_assign_sprint_chip()

  if (!hasAnyEligible) return null

  return (
    <SprintAssignMenu
      open={open}
      onOpenChange={setOpen}
      sprints={sprints}
      selectedId={current?.id ?? null}
      onSelect={(s) => addToSprint({ groupId: s.id, ticketIds: [ticketId] })}
      onClear={
        current
          ? () =>
              removeFromSprint({
                groupId: current.id,
                ticketIds: [ticketId]
              })
          : undefined
      }
      trigger={
        <Button
          type="button"
          variant="chip"
          onClick={(e) => e.stopPropagation()}
          aria-label={
            current
              ? m.tickets_sprint_chip_aria({ name: current.name })
              : m.tickets_assign_sprint_chip()
          }
          className={className}
        >
          {current ? (
            <SprintStateIcon sprint={current} size="xs" />
          ) : (
            <Plus className="size-3.5" strokeWidth={1.75} />
          )}
          <span className="max-w-[14ch] truncate">{label}</span>
        </Button>
      }
    />
  )
}
