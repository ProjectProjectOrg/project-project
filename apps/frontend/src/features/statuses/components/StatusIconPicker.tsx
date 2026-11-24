import type { StatusIconName } from "@pp/shared"
import { IconGridPicker } from "@pp/ui/icon-grid-picker"

import {
  STATUS_ICON_NAMES,
  STATUS_ICON_COMPONENTS
} from "@/features/statuses/lib/statusIcons"
import { m } from "@/paraglide/messages"

export function StatusIconPicker({
  value,
  color,
  onChange,
  disabled = false
}: Readonly<{
  value: StatusIconName
  color: string
  onChange: (icon: StatusIconName) => void
  disabled?: boolean
}>) {
  const Current = STATUS_ICON_COMPONENTS[value]
  return (
    <IconGridPicker
      value={value}
      options={STATUS_ICON_NAMES}
      onChange={onChange}
      disabled={disabled}
      triggerLabel={m.tickets_status_icon_picker_aria()}
      triggerIcon={<Current className="size-4" style={{ color }} />}
      optionLabel={(name) => m.tickets_status_icon_option_aria({ name })}
      renderIcon={(name) => {
        const Icon = STATUS_ICON_COMPONENTS[name]
        return <Icon className="size-3.5" style={{ color }} />
      }}
    />
  )
}
