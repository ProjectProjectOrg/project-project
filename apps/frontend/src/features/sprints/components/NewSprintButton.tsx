import { Button } from "@pp/ui/button"
import { Plus } from "@pp/ui/icons"
import { useState } from "react"

import { m } from "@/paraglide/messages"

import { NewSprintPopover } from "./NewSprintPopover"

export function NewSprintButton({
  variant
}: Readonly<{ variant: "primary" | "secondary" }>) {
  const [open, setOpen] = useState(false)
  return (
    <NewSprintPopover
      open={open}
      onOpenChange={setOpen}
      trigger={
        <Button variant={variant} size="sm" leadingIcon={Plus}>
          {m.sprints_new_button()}
        </Button>
      }
    />
  )
}
