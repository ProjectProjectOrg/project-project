import { useAtomValue } from "@effect/atom-react"
import * as Result from "effect/unstable/reactivity/AsyncResult"
import { useMemo } from "react"
import { boardRequest, sprintBoard } from "@/atoms/sprintBoard"
import { TicketToolbar } from "@/components/TicketList/toolbar"
import type { GroupId, Member, TicketListQuery } from "@projectproject/shared"
import { useBoardTickets } from "./useBoardTickets"

export function SprintBoardToolbar({
  orgSlug,
  slug,
  groupId,
  query,
  onQueryChange,
  members
}: {
  orgSlug: string
  slug: string
  groupId: GroupId
  query: TicketListQuery
  onQueryChange: (query: TicketListQuery) => void
  members: ReadonlyArray<Member>
}) {
  const req = useMemo(
    () => boardRequest(orgSlug, slug, groupId),
    [orgSlug, slug, groupId]
  )
  const board = useAtomValue(sprintBoard(req))
  const tickets = Result.isSuccess(board) ? board.value.tickets : []
  const { counts } = useBoardTickets(orgSlug, slug, tickets, query)
  return (
    <TicketToolbar
      orgSlug={orgSlug}
      slug={slug}
      query={query}
      onQueryChange={onQueryChange}
      members={members}
      counts={counts}
      filters={["type", "assignee", "tags"]}
    />
  )
}
