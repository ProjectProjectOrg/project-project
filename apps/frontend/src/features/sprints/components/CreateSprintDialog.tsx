import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog"
import { createSprintDialog } from "@/features/sprints/atoms/createSprintDialog"
import { CreateSprintForm } from "@/features/sprints/forms/create-sprint"
import { useRouteBoundDialog } from "@/hooks/useRouteBoundDialog"

export function CreateSprintDialogHost() {
  const { open, shown, close } = useRouteBoundDialog(createSprintDialog)
  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) close()
      }}
    >
      <DialogContent size="lg" showCloseButton={false} className="p-0">
        {shown !== null && (
          <CreateSprintForm
            key={`${shown.orgSlug}:${shown.projectSlug ?? ""}:${shown.completeFrom?.id ?? ""}:${shown.tickets?.join(",") ?? ""}`}
            request={shown}
            Title={DialogTitle}
            onDone={close}
          />
        )}
      </DialogContent>
    </Dialog>
  )
}
