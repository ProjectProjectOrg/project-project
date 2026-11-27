import { useAtomValue } from "@effect/atom-react"
import { TicketPolicy } from "@pp/access/policies"
import type { Member } from "@pp/shared"
import { boardCardSlotClass } from "@pp/ui/board-column"
import { cn } from "@pp/ui/lib/utils"
import { listGridClassName } from "@pp/ui/list-row"
import * as Result from "effect/reactivity/AsyncResult"
import { type ReactNode } from "react"

import { currentUserId } from "@/features/auth/atoms/auth"
import {
  project,
  projectActor,
  projectRequest
} from "@/features/projects/atoms/projects"
import { ProjectContext } from "@/features/projects/hooks/useProject"
import { SprintBoardCard } from "@/features/sprints/components/SprintBoardCard"
import type {
  OrgTicket,
  OrgTicketUpdates
} from "@/features/tickets/atoms/myTickets"
import { Row } from "@/features/tickets/components/ticket-list/Row"
import { RowSettings } from "@/features/tickets/components/ticket-list/RowSettings"
import { SelectionOrder } from "@/features/tickets/components/ticket-list/TicketSelection"
import { selectionKey } from "@/features/tickets/lib/ticketSelection"

const NO_MEMBERS: ReadonlyArray<Member> = []

const useTicketUpdates = (update: OrgTicketUpdates, item: OrgTicket) => {
  const viewerId = useAtomValue(currentUserId)
  return update({
    viewerId: viewerId ?? "",
    projectSlug: item.project.slug
  })
}

const useProjectMembers = (orgSlug: string, slug: string) => {
  const result = useAtomValue(project(projectRequest(orgSlug, slug)))
  return Result.isSuccess(result) ? result.value.members : NO_MEMBERS
}

type DashboardTicketProps = Readonly<{
  orgSlug: string
  item: OrgTicket
  update: OrgTicketUpdates
}>

type DashboardRowProps = DashboardTicketProps &
  Readonly<{
    below?: ReactNode
  }>

export function DashboardRow({
  orgSlug,
  item,
  update,
  below
}: DashboardRowProps) {
  const updates = useTicketUpdates(update, item)
  const projectReq = projectRequest(orgSlug, item.project.slug)
  const members = useProjectMembers(orgSlug, item.project.slug)
  const editable = TicketPolicy.canChange(
    useAtomValue(projectActor(projectReq)),
    { content: true }
  )
  return (
    <ProjectContext.Provider value={projectReq}>
      <div
        className={cn(
          "col-span-full grid grid-cols-subgrid",
          below !== undefined &&
            "relative isolate rounded-lg border border-border surface-card transition-colors hover:surface-lit has-[[data-popup-open]]:surface-lit has-[[data-selected]]:bg-foreground/6"
        )}
      >
        <RowSettings>
          <Row
            variant={below === undefined ? "standalone" : "embedded"}
            showSprint={false}
            ticket={item.ticket}
            members={members}
            editable={editable}
            update={updates}
          />
        </RowSettings>
        {below !== undefined && (
          <div className="col-span-full -mt-1.5 grid grid-cols-subgrid items-center gap-x-(--list-row-gap) pr-3 pb-2.5 pl-(--list-pad-start)">
            {below}
          </div>
        )}
      </div>
    </ProjectContext.Provider>
  )
}

export function DashboardCard({ orgSlug, item, update }: DashboardTicketProps) {
  const updates = useTicketUpdates(update, item)
  const projectReq = projectRequest(orgSlug, item.project.slug)
  const members = useProjectMembers(orgSlug, item.project.slug)
  return (
    <ProjectContext.Provider value={projectReq}>
      <div className={boardCardSlotClass}>
        <SprintBoardCard
          ticket={item.ticket}
          members={members}
          update={updates}
        />
      </div>
    </ProjectContext.Provider>
  )
}

export function DashboardRows({
  orgSlug,
  tickets,
  update,
  below
}: Readonly<{
  orgSlug: string
  tickets: ReadonlyArray<OrgTicket>
  update: OrgTicketUpdates
  below?: (item: OrgTicket) => ReactNode
}>) {
  const viewerId = useAtomValue(currentUserId) ?? ""
  return (
    <SelectionOrder
      entries={tickets.map((item) => {
        const { bulk, sprintBulk, remove } = update({
          viewerId,
          projectSlug: item.project.slug
        })
        return {
          key: selectionKey(item.project.slug, item.ticket.id),
          ticket: item.ticket,
          bulk,
          sprintBulk,
          remove
        }
      })}
    >
      <div className={cn(listGridClassName, below !== undefined && "gap-y-2")}>
        {tickets.map((item) => (
          <DashboardRow
            key={`${item.project.slug}/${item.ticket.id}`}
            orgSlug={orgSlug}
            item={item}
            update={update}
            below={below?.(item)}
          />
        ))}
      </div>
    </SelectionOrder>
  )
}
