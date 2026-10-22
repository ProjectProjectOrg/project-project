import type { ReactNode } from "react"

import { SettingsSection } from "@/components/settings/SettingsSection"
import { Button } from "@/components/ui/button"
import { m } from "@/paraglide/messages"

export type StepFrame = Readonly<{
  progress: string
  busy: boolean
  error: string | null
  onCancel: (() => void) | undefined
}>

export function SetupStep({
  frame,
  title,
  description,
  submitLabel = m.slack_setup_continue(),
  submitting = false,
  onBack,
  onSubmit,
  children
}: Readonly<{
  frame: StepFrame
  title: string
  description: string
  submitLabel?: string
  submitting?: boolean
  onBack: (() => void) | undefined
  onSubmit: () => void
  children: ReactNode
}>) {
  return (
    <form
      noValidate
      className="flex flex-col gap-3"
      onSubmit={(event) => {
        event.preventDefault()
        if (!frame.busy) onSubmit()
      }}
    >
      <SettingsSection title={title} description={description}>
        {children}
      </SettingsSection>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p
          className="font-mono text-xs text-muted-foreground"
          aria-live="polite"
        >
          {frame.progress}
        </p>
        <div className="flex items-center gap-2">
          {frame.error ? (
            <p role="alert" className="text-xs text-destructive">
              {frame.error}
            </p>
          ) : null}
          {frame.onCancel ? (
            <Button
              type="button"
              variant="tertiary"
              size="sm"
              disabled={frame.busy}
              onClick={frame.onCancel}
            >
              {m.common_cancel_button()}
            </Button>
          ) : null}
          {onBack ? (
            <Button
              type="button"
              variant="tertiary"
              size="sm"
              disabled={frame.busy}
              onClick={onBack}
            >
              {m.slack_setup_back()}
            </Button>
          ) : null}
          <Button
            type="submit"
            size="sm"
            disabled={frame.busy}
            loading={submitting}
          >
            {submitLabel}
          </Button>
        </div>
      </div>
    </form>
  )
}
