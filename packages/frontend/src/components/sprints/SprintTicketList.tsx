import { useAtomValue } from "@effect-atom/atom-react"
import { TicketList } from "@/components/TicketList"
import { SprintTicketCreator } from "@/components/TicketList/SprintTicketCreator"
import {
  projectKey,
  sprintMembershipAtom
} from "@/atoms/sprints"
import { m } from "@/paraglide/messages"
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
  const membership = useAtomValue(
    sprintMembershipAtom(projectKey(orgSlug, slug))
  )
  const filterIds = new Set(ticketIds)

  return (
    <TicketList
      orgSlug={orgSlug}
      slug={slug}
      members={members}
      uiKey={uiKey}
      filterIds={filterIds}
      sprintMembership={membership}
      creator={
        isCompleted ? (
          <p className="px-3 py-2 text-xs text-muted-foreground">
            {m.sprints_completed_closed_notice()}
          </p>
        ) : (
          <SprintTicketCreator
            orgSlug={orgSlug}
            slug={slug}
            groupId={groupId}
            excludeIds={filterIds}
          />
        )
      }
    />
  )
}
