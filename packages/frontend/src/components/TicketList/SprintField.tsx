import * as Effect from "effect/Effect"
import * as Registry from "effect/unstable/reactivity/AtomRegistry"
import * as Result from "effect/unstable/reactivity/AsyncResult"
import { RegistryContext, useAtomValue } from "@effect/atom-react"
import { Plus } from "lucide-react"
import { useContext, useMemo, useState } from "react"
import { SprintStateIcon } from "@/components/sprints/SprintChip"
import { SprintAssignMenu } from "@/components/sprints/SprintAssignMenu"
import { Button } from "@/components/ui/button"
import { Hitbox } from "@/components/ui/hitbox"
import { m } from "@/paraglide/messages"
import {
  addTicketsToSprint,
  removeTicketsFromSprint,
  sprintList,
  sprintListRequest,
  sprintMembership
} from "@/atoms/sprintList"
import { type Group, type TicketId } from "@projectproject/shared"

function dispatchMembership(
  registry: Registry.AtomRegistry,
  atom: ReturnType<typeof addTicketsToSprint>,
  ticketIds: ReadonlyArray<TicketId>
) {
  const unmount = registry.mount(atom)
  registry.set(atom, { ticketIds })
  void Effect.runPromiseExit(
    Registry.getResult(registry, atom, { suspendOnWaiting: true })
  ).finally(unmount)
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
  const req = useMemo(() => sprintListRequest(orgSlug, slug), [orgSlug, slug])
  const registry = useContext(RegistryContext)
  const list = useAtomValue(sprintList(req))
  const [open, setOpen] = useState(false)

  if (!membership) return null

  const sprints = Result.isSuccess(list) ? list.value : []

  return (
    <SprintAssignMenu
      open={open}
      onOpenChange={setOpen}
      sprints={sprints}
      selectedId={membership.id}
      onSelect={(s) =>
        dispatchMembership(
          registry,
          addTicketsToSprint({ req, groupId: s.id }),
          [ticketId]
        )
      }
      onClear={() =>
        dispatchMembership(
          registry,
          removeTicketsFromSprint({ req, groupId: membership.id }),
          [ticketId]
        )
      }
      onRequestNewSprint={onRequestNewSprint}
      trigger={
        <Hitbox
          mode="inline"
          margin="2"
          onClick={(e) => e.stopPropagation()}
          aria-label={m.tickets_sprint_chip_aria({ name: membership.name })}
          className="min-w-0"
        >
          <span className="inline-flex max-w-[14ch] items-center gap-1 rounded-md px-1.5 py-0.5 text-xs text-muted-foreground transition-colors group-hover/hitbox:bg-foreground/5 group-hover/hitbox:text-foreground">
            <SprintStateIcon sprint={membership} size="xs" />
            <span className="truncate">{membership.name}</span>
          </span>
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
  const req = useMemo(() => sprintListRequest(orgSlug, slug), [orgSlug, slug])
  const registry = useContext(RegistryContext)
  const list = useAtomValue(sprintList(req))
  const membership = useAtomValue(sprintMembership(req))
  const [open, setOpen] = useState(false)
  const sprints = Result.isSuccess(list) ? list.value : []
  const hasAnyEligible = sprints.some((s) => s.completedAt === null)
  const current = Result.isSuccess(membership)
    ? (membership.value.get(ticketId) ?? null)
    : null
  const label = current?.name ?? m.tickets_assign_sprint_chip()

  if (!hasAnyEligible) return null

  return (
    <SprintAssignMenu
      open={open}
      onOpenChange={setOpen}
      sprints={sprints}
      selectedId={current?.id ?? null}
      onSelect={(s) =>
        dispatchMembership(
          registry,
          addTicketsToSprint({ req, groupId: s.id }),
          [ticketId]
        )
      }
      onClear={
        current
          ? () =>
              dispatchMembership(
                registry,
                removeTicketsFromSprint({ req, groupId: current.id }),
                [ticketId]
              )
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
