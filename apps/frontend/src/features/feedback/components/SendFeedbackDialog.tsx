import { useAtomValue } from "@effect/atom-react"
import { Dialog, DialogContent, DialogTitle } from "@pp/ui/dialog"
import * as AsyncResult from "effect/reactivity/AsyncResult"

import {
  feedbackStatus,
  sendFeedbackDialog
} from "@/features/feedback/atoms/feedback"
import { SendFeedbackForm } from "@/features/feedback/forms/send-feedback"
import { useRouteBoundDialog } from "@/hooks/useRouteBoundDialog"

export function SendFeedbackDialogHost() {
  const { open, shown, close } = useRouteBoundDialog(sendFeedbackDialog)
  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) close()
      }}
    >
      <DialogContent size="lg" className="p-0">
        {shown !== null && (
          <FeedbackDialogForm
            key={shown.orgSlug}
            orgSlug={shown.orgSlug}
            onDone={close}
          />
        )}
      </DialogContent>
    </Dialog>
  )
}

function FeedbackDialogForm({
  orgSlug,
  onDone
}: Readonly<{ orgSlug: string; onDone: () => void }>) {
  const status = useAtomValue(feedbackStatus(orgSlug))
  return (
    <SendFeedbackForm
      orgSlug={orgSlug}
      attachments={AsyncResult.isSuccess(status) && status.value.attachments}
      Title={DialogTitle}
      onDone={onDone}
    />
  )
}
