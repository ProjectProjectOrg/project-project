import type { StatusIconName } from "@pp/shared"

import { IconGridPicker } from "@/components/ui/icon-grid-picker"
import { STATUS_ICON_NAMES, getStatusIcon } from "@/lib/status-icons"
import { m } from "@/paraglide/messages"

type Props = {
  value: string
  onChange: (icon: StatusIconName) => void
  onOpenChange?: (open: boolean) => void
  className?: string
  disabled?: boolean
  color?: string
}

export function StatusIconPicker({
  value,
  onChange,
  onOpenChange,
  className,
  disabled,
  color
}: Props) {
  const Current = getStatusIcon(value)
  return (
    <IconGridPicker
      value={STATUS_ICON_NAMES.find((name) => name === value) ?? "Circle"}
      options={STATUS_ICON_NAMES}
      onChange={onChange}
      onOpenChange={onOpenChange}
      disabled={disabled}
      className={className}
      triggerLabel={m.tickets_status_icon_picker_aria()}
      triggerIcon={
        <Current className="size-4" style={color ? { color } : undefined} />
      }
      optionLabel={(name) => m.tickets_status_icon_option_aria({ name })}
      renderIcon={(name) => {
        const Icon = getStatusIcon(name)
        return <Icon className="size-3.5" />
      }}
    />
  )
}
