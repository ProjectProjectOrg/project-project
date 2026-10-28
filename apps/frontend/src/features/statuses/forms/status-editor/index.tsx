import { STATUS_DESCRIPTION_MAX_LENGTH } from "@pp/shared"
import { useState, type KeyboardEvent } from "react"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { StatusIconPicker } from "@/features/statuses/components/StatusIconPicker"
import { useAppForm, useFormValues } from "@/lib/form"
import { cn } from "@/lib/utils"
import { m } from "@/paraglide/messages"

import { statusEditorFormOpts, type StatusEditorValues } from "./opts"

export type { StatusEditorValues } from "./opts"

const FIELD = "h-8 rounded-lg focus-visible:border-ring focus-visible:ring-0"

type Props = Readonly<{
  initial: StatusEditorValues
  identityLocked: boolean
  submitLabel: string
  error: string | null
  onSubmit: (values: StatusEditorValues) => Promise<boolean>
  onCancel: () => void
}>

export function StatusEditorForm({
  initial,
  identityLocked,
  submitLabel,
  error,
  onSubmit,
  onCancel
}: Props) {
  const [busy, setBusy] = useState(false)
  const form = useAppForm({
    ...statusEditorFormOpts(initial),
    onSubmit: async ({ value }) => {
      setBusy(true)
      if (!(await onSubmit(value))) setBusy(false)
    }
  })
  const values = useFormValues(form)

  const cancelOnEscape = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Escape" && !busy) {
      e.preventDefault()
      onCancel()
    }
  }

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault()
        if (!busy) void form.handleSubmit()
      }}
      className="flex min-h-14 flex-col justify-center py-2 pr-2 pl-1"
    >
      <div className="flex items-center gap-2">
        <span className="w-4 shrink-0" />
        <form.Field name="color">
          {(colorField) => (
            <form.Field name="icon">
              {(iconField) => (
                <StatusIconPicker
                  value={iconField.value}
                  color={colorField.value}
                  iconLocked={identityLocked}
                  disabled={busy}
                  onChange={iconField.handleChange}
                  onColorChange={colorField.handleChange}
                />
              )}
            </form.Field>
          )}
        </form.Field>
        <form.Field name="label">
          {(field) => (
            <Input
              // oxlint-disable-next-line jsx-a11y/no-autofocus -- focus follows the click that opened the editor
              autoFocus={!identityLocked}
              maxLength={40}
              value={field.value}
              disabled={busy || identityLocked}
              aria-label={m.tickets_status_name_aria()}
              aria-invalid={field.errors.length > 0}
              placeholder={m.tickets_status_create_placeholder()}
              onChange={(e) => field.handleChange(e.target.value)}
              onBlur={field.handleBlur}
              onKeyDown={cancelOnEscape}
              className={cn("w-56 shrink-0", FIELD)}
            />
          )}
        </form.Field>
        <form.Field name="description">
          {(field) => (
            <Input
              // oxlint-disable-next-line jsx-a11y/no-autofocus -- focus follows the click that opened the editor
              autoFocus={identityLocked}
              maxLength={STATUS_DESCRIPTION_MAX_LENGTH}
              value={field.value}
              disabled={busy}
              aria-label={m.tickets_status_description_aria({
                label:
                  values.label.trim() || m.tickets_status_create_placeholder()
              })}
              aria-invalid={field.errors.length > 0}
              placeholder={m.tickets_status_description_placeholder()}
              onChange={(e) => field.handleChange(e.target.value)}
              onBlur={field.handleBlur}
              onKeyDown={cancelOnEscape}
              className={cn("min-w-0 flex-1", FIELD)}
            />
          )}
        </form.Field>
        <Button
          type="button"
          size="sm"
          variant="ghost"
          disabled={busy}
          onClick={onCancel}
        >
          {m.tickets_status_delete_cancel()}
        </Button>
        <Button
          type="submit"
          size="sm"
          variant="primary"
          disabled={busy || values.label.trim().length === 0}
        >
          {submitLabel}
        </Button>
      </div>
      {error ? (
        <p className="pt-1.5 pl-16 text-xs text-destructive" role="alert">
          {error}
        </p>
      ) : null}
    </form>
  )
}
