import { useAtomSet } from "@effect-atom/atom-react"
import { X } from "lucide-react"
import { TicketList } from "@/components/TicketList"
import { Hitbox } from "@/components/ui/hitbox"
import { m } from "@/paraglide/messages"
import {
  projectKey,
  removeTicketsFromSprintAtom
} from "@/atoms/sprints"
import type {
  GroupId,
  Member,
  TicketId
} from "@projectproject/shared"

export function SprintTicketList({
  orgSlug,
  slug,
  groupId,
  ticketIds,
  members,
  uiKey,
  isCompleted
}: {
  orgSlug: string
  slug: string
  groupId: GroupId
  ticketIds: ReadonlyArray<TicketId>
  members: ReadonlyArray<Member>
  uiKey: string
  isCompleted: boolean
}) {
  const remove = useAtomSet(
    removeTicketsFromSprintAtom(projectKey(orgSlug, slug))
  )
  const filterIds = new Set(ticketIds)

  return (
    <TicketList
      orgSlug={orgSlug}
      slug={slug}
      members={members}
      uiKey={uiKey}
      filterIds={filterIds}
      extraRowActions={
        isCompleted
          ? undefined
          : (ticket) => (
              <Hitbox
                mode="inline"
                margin="2"
                onClick={(e) => {
                  e.stopPropagation()
                  remove({ groupId, ticketIds: [ticket.id] })
                }}
                aria-label={m.sprints_remove_from_sprint_action()}
                className="opacity-0 transition-opacity group-hover/list-row:opacity-100 focus-visible:opacity-100"
              >
                <X
                  className="size-3.5 text-muted-foreground transition-colors group-hover/hitbox:text-foreground"
                  strokeWidth={1.75}
                />
              </Hitbox>
            )
      }
    />
  )
}
