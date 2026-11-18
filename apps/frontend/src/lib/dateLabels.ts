import type { DatePickerLabels } from "@pp/ui/date-picker"

import { m } from "@/paraglide/messages"

// DatePicker's strings, from the app's messages. Pass `clear` for a picker
// whose value can be removed ("Clear dates", "Unschedule").
export const dateLabels = (mode: "single" | "range", clear?: string) =>
  ({
    placeholder:
      mode === "single" ? m.common_date_pick() : m.common_dates_pick(),
    type: mode === "single" ? m.common_date_type() : m.common_dates_type(),
    unreadable: m.common_date_unreadable(),
    previousMonth: m.common_previous_month(),
    nextMonth: m.common_next_month(),
    ...(clear === undefined ? {} : { clear })
  }) satisfies DatePickerLabels
