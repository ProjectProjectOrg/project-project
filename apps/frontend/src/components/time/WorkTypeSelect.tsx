import type { WorkTypeOption } from "@pp/shared"

import { Select, SelectTrigger } from "@/components/ui/select"
import * as m from "@/paraglide/messages"

export function WorkTypeSelect({
  value,
  onChange,
  options,
  disabled
}: {
  value: string
  onChange: (value: string) => void
  options: ReadonlyArray<WorkTypeOption>
  disabled?: boolean
}) {
  const selectedLabel =
    options.find((option) => option.key === value)?.label ?? null
  return (
    <Select
      value={value || null}
      onValueChange={onChange}
      disabled={disabled}
      items={options.map((option) => ({
        value: option.key,
        label: option.label
      }))}
    >
      <SelectTrigger
        placeholder={m.time_work_type_label()}
        selectedLabel={selectedLabel}
        aria-label={m.time_work_type_label()}
      />
    </Select>
  )
}
