import { useAtomSet, useAtomValue } from "@effect/atom-react"
import * as DateTime from "effect/DateTime"
import * as Result from "effect/reactivity/AsyncResult"

import { Dialog, DialogContent } from "@/components/ui/dialog"
import { MentionScopeProvider } from "@/features/editor/mentions/scope"
import { project, projectRequest } from "@/features/projects/atoms/projects"
import { ProjectContext } from "@/features/projects/hooks/useProject"
import { bulkUpdateTickets } from "@/features/tickets/atoms/bulkTickets"
import {
  flagTicketDialog,
  type FlagTicketDialogRequest
} from "@/features/tickets/atoms/flagTicketDialog"
import {
  ticketRequest,
  updateTicketDetail
} from "@/features/tickets/atoms/ticketDetail"
import { FlagForm } from "@/features/tickets/forms/flag-ticket"
import { flagFor } from "@/features/tickets/lib/ticketFlag"
import { useProjectActor } from "@/hooks/useActor"
import { useRouteBoundDialog } from "@/hooks/useRouteBoundDialog"
import { mutationErrorText } from "@/lib/mutationError"
import { m } from "@/paraglide/messages"

export function FlagTicketDialogHost() {
  const { open, shown, close } = useRouteBoundDialog(flagTicketDialog)
  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) close()
      }}
    >
      <DialogContent size="lg" showCloseButton={false} className="p-0">
        {shown !== null && (
          <ProjectContext value={projectRequest(shown.orgSlug, shown.slug)}>
            <FlagTicket
              key={`${shown.orgSlug}:${shown.slug}:${shown.ticketId}`}
              request={shown}
              onDone={close}
            />
          </ProjectContext>
        )}
      </DialogContent>
    </Dialog>
  )
}

function FlagTicket({
  request,
  onDone
}: Readonly<{ request: FlagTicketDialogRequest; onDone: () => void }>) {
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
