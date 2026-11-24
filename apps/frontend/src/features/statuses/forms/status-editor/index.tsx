import { STATUS_DESCRIPTION_MAX_LENGTH } from "@pp/shared"
import { Button } from "@pp/ui/button"
import { ColorPicker } from "@pp/ui/color-picker"
import { Input } from "@pp/ui/input"
import type { KeyboardEvent } from "react"

import { StatusIconPicker } from "@/features/statuses/components/StatusIconPicker"
import { STATUS_ICON_COMPONENTS } from "@/features/statuses/lib/statusIcons"
import { useAppForm, useFormValues } from "@/lib/form"
import { m } from "@/paraglide/messages"

import { statusEditorFormOpts, type StatusEditorValues } from "./opts"

export type { StatusEditorValues } from "./opts"

type Props = Readonly<{
  initial: StatusEditorValues
  busy: boolean
  identityLocked: boolean
  submitLabel: string
  error: string | null
  onSubmit: (values: StatusEditorValues) => Promise<void>
  onCancel: () => void
}>

export function StatusEditorForm({
  initial,
  busy,
  identityLocked,
  submitLabel,
  error,
  onSubmit,
  onCancel
}: Props) {
  const form = useAppForm({
    ...statusEditorFormOpts(initial),
    onSubmit: ({ value }) => onSubmit(value)
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
        <form.Field name="icon">
          {(iconField) =>
            identityLocked ? (
              <StatusGlyphBox icon={iconField.value} color={values.color} />
            ) : (
              <StatusIconPicker
                value={iconField.value}
                color={values.color}
                disabled={busy}
                onChange={iconField.handleChange}
              />
            )
          }
        </form.Field>
        <form.Field name="color">
          {(colorField) => (
            <ColorPicker
              value={colorField.value}
              onChange={colorField.handleChange}
              ariaLabel={m.tickets_status_color_picker_aria()}
              swatchLabel={(hex) => m.color_swatch_aria_label({ hex })}
            />
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
              size="md"
              className="w-56 shrink-0"
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
              size="md"
              className="min-w-0 flex-1"
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
        <p className="pt-1.5 pl-16 text-caption text-destructive" role="alert">
          {error}
        </p>
      ) : null}
    </form>
  )
}

// A built-in status keeps its icon: shown in the trigger's place, so the
// colour and the name stay where they are.
function StatusGlyphBox({
  icon,
  color
}: Readonly<{ icon: StatusEditorValues["icon"]; color: string }>) {
  const Icon = STATUS_ICON_COMPONENTS[icon]
  return (
    <span
      aria-hidden
      className="flex size-8 shrink-0 items-center justify-center"
    >
      <Icon className="size-4" style={{ color }} />
    </span>
  )
}
