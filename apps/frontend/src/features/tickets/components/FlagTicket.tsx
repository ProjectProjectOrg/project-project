import { useAtomSet, useAtomValue } from "@effect/atom-react"
import type { TicketId } from "@pp/shared"
import { MentionScopeProvider } from "@pp/ui/editor/mentions/scope"
import * as DateTime from "effect/DateTime"
import * as Result from "effect/reactivity/AsyncResult"

import { project, projectRequest } from "@/features/projects/atoms/projects"
import { bulkUpdateTickets } from "@/features/tickets/atoms/bulkTickets"
import {
  ticketRequest,
  updateTicketDetail
} from "@/features/tickets/atoms/ticketDetail"
import { FlagForm } from "@/features/tickets/forms/flag-ticket"
import { flagFor } from "@/features/tickets/lib/ticketFlag"
import { useProjectActor } from "@/hooks/useActor"
import { mutationErrorText } from "@/lib/mutationError"
import { m } from "@/paraglide/messages"

export type FlagTicketRequest = Readonly<{
  orgSlug: string
  slug: string
  ticketId: TicketId
  title: string
  selection: ReadonlyArray<TicketId>
}>

// Flagging a ticket (or a selection) from the ticket menu, inside the menu's
// flag popover.
export function FlagTicket({
  request,
  onDone
}: Readonly<{ request: FlagTicketRequest; onDone: () => void }>) {
  const { userId } = useProjectActor()
  const detail = useAtomValue(
    project(projectRequest(request.orgSlug, request.slug))
  )
  const mutation = updateTicketDetail(
    ticketRequest(request.orgSlug, request.slug, request.ticketId)
  )
  const update = useAtomSet(mutation, { mode: "promiseExit" })
  const state = useAtomValue(mutation)
  const bulk = bulkUpdateTickets({
    orgSlug: request.orgSlug,
    slug: request.slug
  })
  const updateMany = useAtomSet(bulk, { mode: "promiseExit" })
  const manyState = useAtomValue(bulk)
  const many = request.selection.length > 1
  return (
    <MentionScopeProvider
      scope={{
        orgSlug: request.orgSlug,
        slug: request.slug,
        members: Result.isSuccess(detail) ? detail.value.members : undefined
      }}
    >
      <FlagForm
        ticket={
          many
            ? {
                id: null,
                title: m.tickets_selection_flag_title({
                  count: request.selection.length
                })
              }
            : { id: request.ticketId, title: request.title }
        }
        onFlag={(reason) => {
          if (!many) {
            return update({
              flag: flagFor(
                reason,
                userId,
                DateTime.toDate(DateTime.nowUnsafe())
              )
            })
          }
          const trimmed = reason.trim()
          return updateMany({
            tickets: request.selection,
            patch: { flag: trimmed === "" ? {} : { reason: trimmed } }
          })
        }}
        waiting={many ? manyState.waiting : state.waiting}
        error={many ? mutationErrorText(manyState) : mutationErrorText(state)}
        onClose={onDone}
      />
    </MentionScopeProvider>
  )
}
