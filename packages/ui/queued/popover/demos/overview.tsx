import { Button } from "@pp/ui/button"
import {
  Popover,
  PopoverClose,
  PopoverContent,
  PopoverTitle,
  PopoverTrigger
} from "@pp/ui/popover"
import { X } from "lucide-react"
import { useState } from "react"

const USER_TOGGLES = new Set(["trigger-press", "escape-key", "close-press"])

export default function Overview() {
  const [open, setOpen] = useState(true)

  return (
    <Popover
      open={open}
      onOpenChange={(next, details) => {
        if (USER_TOGGLES.has(details.reason)) setOpen(next)
      }}
    >
      <PopoverTrigger render={<Button variant="tertiary" />}>
        Popover
      </PopoverTrigger>
      <PopoverContent align="start" className="w-72">
        <div className="flex items-start justify-between gap-3">
          <PopoverTitle className="text-subtitle text-foreground">
            Title
          </PopoverTitle>
          <PopoverClose
            render={
              <Button variant="ghost" size="icon-xs" aria-label="Close" />
            }
          >
            <X />
          </PopoverClose>
        </div>
        <p className="mt-1 text-body text-muted-foreground">
          Body text on the popover surface, with a title, a close button and an
          action.
        </p>
        <div className="mt-3 flex justify-end gap-2">
          <PopoverClose render={<Button variant="ghost" size="sm" />}>
            Cancel
          </PopoverClose>
          <Button size="sm">Confirm</Button>
        </div>
      </PopoverContent>
    </Popover>
  )
}
