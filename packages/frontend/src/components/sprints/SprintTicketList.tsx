import { useAtomValue } from "@effect-atom/atom-react"
import { TicketList } from "@/components/TicketList"
import { projectKey, sprintMembershipAtom } from "@/atoms/sprints"
import type { GroupId, Member, TicketId } from "@projectproject/shared"

export function SprintTicketList({
  orgSlug,
  slug,
  ticketIds,
  members,
  uiKey
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
      creator={null}
    />
  )
}
