import { STATUS_DESCRIPTION_MAX_LENGTH, type StatusIconName } from "@pp/shared"
import { useState, type KeyboardEvent } from "react"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { StatusIconPicker } from "@/features/statuses/components/StatusIconPicker"
import { cn } from "@/lib/utils"
import { m } from "@/paraglide/messages"

const FIELD = "h-8 rounded-lg focus-visible:border-ring focus-visible:ring-0"

export type StatusDraft = Readonly<{
  label: string
  icon: StatusIconName
  color: string
  description: string
}>

type Props = Readonly<{
  initial: StatusDraft
  identityLocked: boolean
  submitLabel: string
  error: string | null
  onSubmit: (draft: StatusDraft) => Promise<boolean>
  onCancel: () => void
}>

export function StatusEditor({
  initial,
  identityLocked,
  submitLabel,
  error,
  onSubmit,
  onCancel
}: Props) {
  const [draft, setDraft] = useState(initial)
  const [busy, setBusy] = useState(false)
  const locked = identityLocked
  const edit = (patch: Partial<StatusDraft>) =>
    setDraft((current) => ({ ...current, ...patch }))

  const cancelOnEscape = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Escape" && !busy) {
      e.preventDefault()
      onCancel()
    }
  }

  const submit = async () => {
    if (busy || draft.label.trim().length === 0) return
    setBusy(true)
    if (!(await onSubmit(draft))) setBusy(false)
  }

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault()
        void submit()
      }}
      className="flex min-h-14 flex-col justify-center py-2 pr-2 pl-1"
    >
      <div className="flex items-center gap-2">
        <span className="w-4 shrink-0" />
        <StatusIconPicker
          value={draft.icon}
          color={draft.color}
          iconLocked={locked}
          disabled={busy}
          onChange={(icon) => edit({ icon })}
          onColorChange={(color) => edit({ color })}
        />
        <Input
          // oxlint-disable-next-line jsx-a11y/no-autofocus -- focus follows the click that opened the editor
          autoFocus={!locked}
          maxLength={40}
          value={draft.label}
          disabled={busy || locked}
          aria-label={m.tickets_status_name_aria()}
          placeholder={m.tickets_status_create_placeholder()}
          onChange={(e) => edit({ label: e.target.value })}
          onKeyDown={cancelOnEscape}
          className={cn("w-56 shrink-0", FIELD)}
        />
        <Input
          // oxlint-disable-next-line jsx-a11y/no-autofocus -- focus follows the click that opened the editor
          autoFocus={locked}
          maxLength={STATUS_DESCRIPTION_MAX_LENGTH}
          value={draft.description}
          disabled={busy}
          aria-label={m.tickets_status_description_aria({
            label: draft.label.trim() || m.tickets_status_create_placeholder()
          })}
          placeholder={m.tickets_status_description_placeholder()}
          onChange={(e) => edit({ description: e.target.value })}
          onKeyDown={cancelOnEscape}
          className={cn("min-w-0 flex-1", FIELD)}
        />
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
          disabled={busy || draft.label.trim().length === 0}
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
