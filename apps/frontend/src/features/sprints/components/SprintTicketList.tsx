import type { GroupDetail, Member, TicketListQuery } from "@pp/shared"
import { ListChecks, Trophy } from "lucide-react"

import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle
} from "@/components/ui/empty"
import { TicketListContent } from "@/features/tickets/components/ticket-list"
import { m } from "@/paraglide/messages"

export function SprintTicketList({
  sprint,
  query,
  members
}: Readonly<{
  sprint: GroupDetail
  query: TicketListQuery
  members: ReadonlyArray<Member>
}>) {
  const completed = sprint.completedAt !== null
  const Icon = completed ? Trophy : ListChecks
  return (
    <TicketListContent
      query={query}
      members={members}
      empty={
        <Empty>
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <Icon strokeWidth={1.75} />
            </EmptyMedia>
            <EmptyTitle>
              {completed
                ? m.sprints_empty_completed_title()
                : m.sprints_empty_title()}
            </EmptyTitle>
            <EmptyDescription>
              {completed
                ? m.sprints_empty_completed_body()
                : m.sprints_empty_body()}
            </EmptyDescription>
          </EmptyHeader>
        </Empty>
      }
    />
  )
}
