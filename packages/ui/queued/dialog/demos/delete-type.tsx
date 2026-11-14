import { Button } from "@pp/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from "@pp/ui/dialog"
import { useState } from "react"

export default function DeleteType() {
  const [open, setOpen] = useState(false)
  return (
    <>
      <Button variant="tertiary" size="sm" onClick={() => setOpen(true)}>
        Delete type
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete type “Bug”?</DialogTitle>
          </DialogHeader>
          <DialogDescription>
            12 tickets in Web app use this type. They move to Task, archived
            tickets included.
          </DialogDescription>
          <DialogFooter>
            <Button variant="tertiary" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={() => setOpen(false)}>
              Delete and move
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
