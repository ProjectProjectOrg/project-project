// Hand-rolled InputGroup primitive — single horizontal row with leading/
// trailing addons. Distinct from @fluid/input-group (vertical multi-field
// form with proximity hover); see ui/fluid-input-group.tsx for that one.
//
// Used by the search bar, create-ticket row, create-project row, and the
// invite-member row. One container styled like an Input, with explicit
// slots for inline addons on either side.

import * as React from "react"
import { cn } from "@/lib/utils"

function InputGroup({
  className,
  ...props
}: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="input-group"
      className={cn(
        "group/input-group relative flex w-full items-center gap-2 rounded-xl border border-border bg-background px-3 py-1.5 transition-[color,box-shadow]",
        "ring-offset-background focus-within:ring-2 focus-within:ring-ring",
        "has-[input:disabled]:opacity-50",
        className
      )}
      {...props}
    />
  )
}

function InputGroupInput({
  className,
  ...props
}: React.ComponentProps<"input">) {
  return (
    <input
      data-slot="input-group-input"
      className={cn(
        "flex-1 min-w-0 bg-transparent text-sm text-foreground outline-none placeholder:text-muted-foreground disabled:cursor-not-allowed",
        className
      )}
      {...props}
    />
  )
}

function InputGroupAddon({
  className,
  ...props
}: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="input-group-addon"
      className={cn(
        "grid size-6 shrink-0 place-items-center text-muted-foreground transition-colors",
        className
      )}
      {...props}
    />
  )
}

function InputGroupHint({
  className,
  ...props
}: React.ComponentProps<"span">) {
  return (
    <span
      data-slot="input-group-hint"
      className={cn("shrink-0 text-xs text-muted-foreground", className)}
      {...props}
    />
  )
}

export { InputGroup, InputGroupAddon, InputGroupInput, InputGroupHint }
