import * as Exit from "effect/Exit"
import type { ReactNode } from "react"

import { Button } from "@/components/ui/button"
import { ConfirmButton } from "@/components/ui/confirm-button"
import { cn } from "@/lib/utils"
import { m } from "@/paraglide/messages"

type Outcome = Exit.Exit<unknown, unknown>

export function EntryActions({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <div className="flex flex-col items-start gap-1 empty:hidden">
      {children}
    </div>
  )
}

export function HideEntryButton({
  waiting,
  error,
  onHide
}: Readonly<{
  waiting: boolean
  error: string | null
  onHide: () => void
}>) {
  return (
    <>
      <Button
        type="button"
        variant="ghost"
        size="sm"
        bleed="start"
        className={cn(waiting && "animate-pulse")}
        onClick={onHide}
      >
        {m.templates_types_hide()}
      </Button>
      {error === null ? null : (
        <p role="alert" className="text-caption text-destructive">
          {error}
        </p>
      )}
    </>
  )
}

export function DeleteEntryTrigger({
  label,
  onClick
}: Readonly<{ label: string; onClick: () => void }>) {
  return (
    <Button
      type="button"
      variant="ghost"
      size="sm"
      bleed="start"
      className="text-destructive hover:text-destructive"
      onClick={onClick}
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
        variant="ghost"
        size="sm"
        bleed="start"
        className="text-destructive hover:text-destructive"
      >
        {label}
      </ConfirmButton.Trigger>
      <ConfirmButton.Confirm className="flex-wrap">
        <ConfirmButton.Action
          prompt={m.templates_settings_delete_confirm({ name })}
          label={m.templates_settings_action_delete()}
          onConfirm={() => onDelete().then(Exit.isSuccess)}
        />
      </ConfirmButton.Confirm>
    </ConfirmButton.Root>
  )
}
