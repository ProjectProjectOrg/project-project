import { Button } from "@pp/ui/button"
import { ConfirmButton } from "@pp/ui/confirm-button"
import * as Exit from "effect/Exit"
import type { ComponentProps } from "react"
import type { ReactNode } from "react"

import { describeCause } from "@/lib/errorMessage"
import { m } from "@/paraglide/messages"

type Outcome = Exit.Exit<unknown, unknown>

export function EntryActions({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <div className="flex flex-col items-start gap-2 border-t border-border/60 pt-4 empty:hidden">
      {children}
    </div>
  )
}

// Also renders as a popover's trigger, so it passes through the props and
// ref the popover gives it.
export function DeleteEntryTrigger({
  label,
  ...props
}: Readonly<{ label: string }> &
  Omit<ComponentProps<typeof Button>, "children">) {
  return (
    <Button
      type="button"
      variant="tertiary"
      size="sm"
      className="text-destructive hover:text-destructive"
      {...props}
    >
      {label}
    </Button>
  )
}

export function DeleteEntryConfirm({
  label,
  name,
  onDelete
}: Readonly<{
  label: string
  name: string
  onDelete: () => Promise<Outcome>
}>) {
  return (
    <ConfirmButton.Root className="flex-wrap">
      <ConfirmButton.Trigger
        type="button"
        variant="tertiary"
        size="sm"
        className="text-destructive hover:text-destructive"
      >
        {label}
      </ConfirmButton.Trigger>
      <ConfirmButton.Confirm className="flex-wrap">
        <ConfirmButton.Action
          cancelLabel={m.common_cancel_button()}
          describeError={describeCause}
          prompt={m.templates_settings_delete_confirm({ name })}
          label={m.templates_settings_action_delete()}
          onConfirm={() => onDelete().then(Exit.isSuccess)}
        />
      </ConfirmButton.Confirm>
    </ConfirmButton.Root>
  )
}
