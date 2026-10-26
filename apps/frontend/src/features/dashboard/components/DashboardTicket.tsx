import { useAtomValue } from "@effect/atom-react"
import { TicketPolicy } from "@pp/access/policies"
import type { Member, Ticket } from "@pp/shared"
import * as Result from "effect/reactivity/AsyncResult"
import { type ReactNode } from "react"

import { me } from "@/features/auth/atoms/auth"
import {
  project,
  projectActor,
  projectRequest
} from "@/features/projects/atoms/projects"
import { ProjectContext } from "@/features/projects/hooks/useProject"
import { BOARD_CARD_SLOT_CLASS } from "@/features/sprints/components/BoardColumnShell"
import { SprintBoardCard } from "@/features/sprints/components/SprintBoardCard"
import type {
  OrgTicket,
  OrgTicketUpdates
} from "@/features/tickets/atoms/myTickets"
import {
  Row,
  rowGridClassName
} from "@/features/tickets/components/ticket-list/Row"
import { useTicketPreview } from "@/features/tickets/components/ticket-list/useTicketPreview"
import { cn } from "@/lib/utils"

const NO_MEMBERS: ReadonlyArray<Member> = []

const useTicketUpdates = (update: OrgTicketUpdates, item: OrgTicket) => {
  const viewer = useAtomValue(me())
  return update({
    viewerId: Result.isSuccess(viewer) ? viewer.value.id : "",
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
    previewOpen: boolean
    onPreviewPointerEnter: (ticketId: Ticket["id"]) => void
    onPreviewOpenChange: (ticketId: Ticket["id"], open: boolean) => void
  }>

export function DashboardRow({
  orgSlug,
  item,
  update,
  below,
  previewOpen,
  onPreviewPointerEnter,
  onPreviewOpenChange
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
            "relative isolate rounded-lg border border-border bg-card transition-colors hover:bg-hover"
        )}
      >
        <Row
          variant={below === undefined ? "standalone" : "embedded"}
          ticket={item.ticket}
          members={members}
          showSprintCol={false}
          showExtraActionsCol={false}
          sprintMembership={null}
          editable={editable}
          update={updates}
          previewOpen={previewOpen}
          onPreviewPointerEnter={onPreviewPointerEnter}
          onPreviewOpenChange={onPreviewOpenChange}
        />
        {below !== undefined && (
          <div className="col-span-full -mt-1.5 grid grid-cols-subgrid items-center gap-3 px-3 pb-2.5">
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
      <div className={BOARD_CARD_SLOT_CLASS}>
        <SprintBoardCard
          ticket={item.ticket}
          members={members}
          update={updates}
        />
      </div>
    </ProjectContext.Provider>
  )
}

export type TicketPreview = ReturnType<typeof useTicketPreview>

export function DashboardRows({
  orgSlug,
  tickets,
  update,
  preview,
  below
}: Readonly<{
  orgSlug: string
  tickets: ReadonlyArray<OrgTicket>
  update: OrgTicketUpdates
  preview: TicketPreview
  below?: (item: OrgTicket) => ReactNode
}>) {
  return (
    <div
      className={cn(rowGridClassName(false), below !== undefined && "gap-y-2")}
    >
      {tickets.map((item) => (
        <DashboardRow
          key={`${item.project.slug}/${item.ticket.id}`}
          orgSlug={orgSlug}
          item={item}
          update={update}
          below={below?.(item)}
          previewOpen={preview.activePreviewId === item.ticket.id}
          onPreviewPointerEnter={preview.onPreviewPointerEnter}
          onPreviewOpenChange={preview.onPreviewOpenChange}
        />
      ))}
    </div>
  )
}
