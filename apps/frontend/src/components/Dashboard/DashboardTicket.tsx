import { useAtomSet, useAtomValue } from "@effect/atom-react"
import type { Member, Ticket } from "@pp/shared"
import * as Result from "effect/unstable/reactivity/AsyncResult"
import type { ReactNode } from "react"

import { ErrorPage } from "@/components/ErrorPage"
import { BOARD_CARD_SLOT_CLASS } from "@/components/sprints/BoardColumnShell"
import { SprintBoardCard } from "@/components/sprints/SprintBoardCard"
import { Row, rowGridClassName } from "@/components/TicketList/Row"
import { useTicketPreview } from "@/components/TicketList/useTicketPreview"
import { me } from "@/features/auth/atoms/auth"
import { project, projectRequest } from "@/features/projects/atoms/projects"
import type {
  OrgTicket,
  OrgTicketsRequest,
  updateMyTicket
} from "@/features/tickets/atoms/myTickets"

const NO_MEMBERS: ReadonlyArray<Member> = []

export type OrgTicketUpdate = typeof updateMyTicket

const useTicketKey = (req: OrgTicketsRequest, item: OrgTicket) => {
  const viewer = useAtomValue(me())
  return {
    req,
    viewerId: Result.isSuccess(viewer) ? viewer.value.id : "",
    projectSlug: item.project.slug,
    id: item.ticket.id
  }
}

const useProjectMembers = (orgSlug: string, slug: string) => {
  const result = useAtomValue(project(projectRequest(orgSlug, slug)))
  return Result.isSuccess(result) ? result.value.members : NO_MEMBERS
}

type DashboardTicketProps = Readonly<{
  req: OrgTicketsRequest
  item: OrgTicket
  update: OrgTicketUpdate
}>

type DashboardRowProps = DashboardTicketProps &
  Readonly<{
    trailing?: ReactNode
    previewOpen: boolean
    onPreviewPointerEnter: (ticketId: Ticket["id"]) => void
    onPreviewOpenChange: (ticketId: Ticket["id"], open: boolean) => void
  }>

export function DashboardRow({
  req,
  item,
  update,
  trailing,
  previewOpen,
  onPreviewPointerEnter,
  onPreviewOpenChange
}: DashboardRowProps) {
  const { orgSlug } = req.params
  const key = useTicketKey(req, item)
  const members = useProjectMembers(orgSlug, item.project.slug)
  const patch = useAtomSet(update(key))
  const state = useAtomValue(update(key))
  return (
    <div className="col-span-full grid grid-cols-subgrid">
      <Row
        orgSlug={orgSlug}
        slug={item.project.slug}
        ticket={item.ticket}
        members={members}
        showSprintCol={false}
        showExtraActionsCol={trailing !== undefined}
        extraRowActions={trailing === undefined ? undefined : () => trailing}
        sprintMembership={null}
        onUpdate={patch}
        previewOpen={previewOpen}
        onPreviewPointerEnter={onPreviewPointerEnter}
        onPreviewOpenChange={onPreviewOpenChange}
      />
      {Result.matchWithError(state, {
        onInitial: () => null,
        onSuccess: () => null,
        onError: (error) => (
          <div className="col-span-full">
            <ErrorPage error={error} contained />
          </div>
        ),
        onDefect: (defect) => (
          <div className="col-span-full">
            <ErrorPage error={defect} contained />
          </div>
        )
      })}
    </div>
  )
}

export function DashboardCard({ req, item, update }: DashboardTicketProps) {
  const { orgSlug } = req.params
  const key = useTicketKey(req, item)
  const members = useProjectMembers(orgSlug, item.project.slug)
  const patch = useAtomSet(update(key))
  const state = useAtomValue(update(key))
  return (
    <div className={BOARD_CARD_SLOT_CLASS}>
      <SprintBoardCard
        orgSlug={orgSlug}
        slug={item.project.slug}
        ticket={item.ticket}
        members={members}
        onPatch={patch}
      />
      {Result.matchWithError(state, {
        onInitial: () => null,
        onSuccess: () => null,
        onError: (error) => <ErrorPage error={error} contained />,
        onDefect: (defect) => <ErrorPage error={defect} contained />
      })}
    </div>
  )
}

export type TicketPreview = ReturnType<typeof useTicketPreview>

export function DashboardRows({
  req,
  tickets,
  update,
  preview,
  trailing
}: Readonly<{
  req: OrgTicketsRequest
  tickets: ReadonlyArray<OrgTicket>
  update: OrgTicketUpdate
  preview: TicketPreview
  trailing?: (item: OrgTicket) => ReactNode
}>) {
  return (
    <div className={rowGridClassName(trailing !== undefined)}>
      {tickets.map((item) => (
        <DashboardRow
          key={`${item.project.slug}/${item.ticket.id}`}
          req={req}
          item={item}
          update={update}
          trailing={trailing?.(item)}
          previewOpen={preview.activePreviewId === item.ticket.id}
          onPreviewPointerEnter={preview.onPreviewPointerEnter}
          onPreviewOpenChange={preview.onPreviewOpenChange}
        />
      ))}
    </div>
  )
}
