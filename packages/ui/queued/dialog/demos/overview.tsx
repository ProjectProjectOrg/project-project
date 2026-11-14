import { Button } from "@pp/ui/button"
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from "@pp/ui/dialog"
import { useState, type ReactNode } from "react"

function Row({
  caption,
  children
}: Readonly<{ caption: string; children: ReactNode }>) {
  return (
    <div className="grid grid-cols-[8rem_1fr] items-center gap-6">
      <span className="text-caption text-muted-foreground">{caption}</span>
      <div className="flex flex-wrap items-center gap-4">{children}</div>
    </div>
  )
}

function Example({
  trigger,
  size,
  closeLabel,
  title,
  description,
  destructive = false
}: Readonly<{
  trigger: string
  size?: "sm" | "lg"
  closeLabel?: string
  title: string
  description: string
  destructive?: boolean
}>) {
  const [open, setOpen] = useState(false)
  return (
    <>
      <Button variant="secondary" size="sm" onClick={() => setOpen(true)}>
        {trigger}
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent size={size} closeLabel={closeLabel}>
          <DialogHeader>
            <DialogTitle>{title}</DialogTitle>
            <DialogDescription>{description}</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <DialogClose render={<Button variant="tertiary" />}>
              Cancel
            </DialogClose>
            <DialogClose
              render={
                <Button variant={destructive ? "destructive" : "primary"} />
              }
            >
              {destructive ? "Delete" : "Save"}
            </DialogClose>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}

export default function Overview() {
  return (
    <div className="grid w-full max-w-xl gap-6">
      <Row caption="Sizes">
        <Example
          trigger="Small (400px)"
          title="Rename section"
          description="The new name shows everywhere the section is used."
        />
        <Example
          trigger="Large (40rem)"
          size="lg"
          title="New sprint"
          description="Plan a sprint for the next two weeks."
        />
      </Row>
      <Row caption="Close button">
        <Example
          trigger="Without closeLabel"
          title="Send feedback"
          description="Tell us what works and what doesn't."
        />
        <Example
          trigger="With closeLabel"
          closeLabel="Close"
          title="Send feedback"
          description="Tell us what works and what doesn't."
        />
      </Row>
      <Row caption="Destructive">
        <Example
          trigger="Delete a type"
          title="Delete type “Bug”?"
          description="No tickets in Web app use this type."
          destructive
        />
      </Row>
    </div>
  )
}
