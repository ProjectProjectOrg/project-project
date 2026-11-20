import { DatePicker } from "@pp/ui/date-picker"
import type { ReactElement } from "react"

import {
  defaultSprintRange,
  nowDate,
  type SprintDateDraft
} from "@/features/sprints/lib/sprintDates"
import { dateLabels } from "@/lib/dateLabels"
import { m } from "@/paraglide/messages"

// Every sprint's dates are picked here, so the composer, the edit form and
// the inline chips share the same tray. A new sprint can't start in the past;
// a sprint that exists can keep (or move to) a past start.
export function SprintDatesPicker({
  value,
  onChange,
  trigger,
  allowPast,
  onOpenChange,
  sideOffset
}: Readonly<{
  value: SprintDateDraft
  onChange: (value: SprintDateDraft) => void
  trigger: ReactElement
  allowPast: boolean
  onOpenChange?: (open: boolean) => void
  sideOffset?: number
}>) {
  return (
    <DatePicker
      mode="range"
      value={{ from: value.from, to: value.to }}
      onChange={(next) => onChange({ from: next.from, to: next.to })}
      labels={dateLabels("range", m.sprints_clear_dates())}
      quickPicks={[
        { label: m.sprints_start_today(), value: defaultSprintRange() }
      ]}
      {...(allowPast
        ? { allowPast: true }
        : { disabled: { before: nowDate() } })}
      onOpenChange={onOpenChange}
      sideOffset={sideOffset}
      trigger={trigger}
    />
  )
}
