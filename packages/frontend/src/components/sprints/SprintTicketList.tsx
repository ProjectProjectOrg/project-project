import { useAtomValue } from "@effect-atom/atom-react"
import type { ReactNode } from "react"
import { TicketList } from "@/components/TicketList"
import { projectKey, sprintMembershipAtom } from "@/atoms/sprints"
import type { Member, TicketId } from "@projectproject/shared"

export function SprintTicketList({
  orgSlug,
  slug,
  ticketIds,
  members,
  uiKey,
  creator
}: {
  orgSlug: string
  slug: string
  ticketIds: ReadonlyArray<TicketId>
  members: ReadonlyArray<Member>
  uiKey: string
  creator: ReactNode
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
      creator={creator}
    />
  )
}
