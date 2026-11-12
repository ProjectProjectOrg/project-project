import { useAtomSet } from "@effect/atom-react"
import * as DateTime from "effect/DateTime"

import { Dialog, DialogContent } from "@/components/ui/dialog"
import { projectRequest } from "@/features/projects/atoms/projects"
import { ProjectContext } from "@/features/projects/hooks/useProject"
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
  const update = useAtomSet(
    updateTicketDetail(
      ticketRequest(request.orgSlug, request.slug, request.ticketId)
    )
  )
  return (
    <FlagForm
      ticket={{ id: request.ticketId, title: request.title }}
      onFlag={(reason) =>
        update({
          flag: flagFor(reason, userId, DateTime.toDate(DateTime.nowUnsafe()))
        })
      }
      onClose={onDone}
    />
  )
}
