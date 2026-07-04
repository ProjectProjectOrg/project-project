import type { WorkTypeOption } from "@projectproject/shared"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger
} from "@/components/ui/select"
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
    <Select value={value} onValueChange={onChange} disabled={disabled}>
      <SelectTrigger
        placeholder={m.time_work_type_label()}
        selectedLabel={selectedLabel}
        aria-label={m.time_work_type_label()}
      />
      <SelectContent>
        {options.map((option, index) => (
          <SelectItem key={option.key} index={index} value={option.key}>
            {option.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  )
}
