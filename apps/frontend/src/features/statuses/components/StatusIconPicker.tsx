import { TAG_COLOR_WHEEL, type StatusIconName } from "@pp/shared"

import { IconGridPicker } from "@/components/ui/icon-grid-picker"
import {
  STATUS_ICON_NAMES,
  getStatusIcon
} from "@/features/statuses/lib/statusIcons"
import { cn } from "@/lib/utils"
import { m } from "@/paraglide/messages"

type Props = {
  value: string
  onChange: (icon: StatusIconName) => void
  onColorChange?: (hex: string) => void
  onOpenChange?: (open: boolean) => void
  className?: string
  disabled?: boolean
  color?: string
  variant?: "outlined" | "ghost"
  iconLocked?: boolean
}

export function StatusIconPicker({
  value,
  onChange,
  onColorChange,
  onOpenChange,
  className,
  disabled,
  color,
  variant,
  iconLocked = false
}: Props) {
  const Current = getStatusIcon(value)
  return (
    <IconGridPicker
      value={STATUS_ICON_NAMES.find((name) => name === value) ?? "Circle"}
      options={iconLocked ? [] : STATUS_ICON_NAMES}
      onChange={onChange}
      onOpenChange={onOpenChange}
      disabled={disabled}
      className={className}
      variant={variant}
      triggerLabel={
        iconLocked
          ? m.tickets_status_color_picker_aria()
          : m.tickets_status_icon_picker_aria()
      }
      triggerIcon={
        <Current className="size-4" style={color ? { color } : undefined} />
      }
      optionLabel={(name) => m.tickets_status_icon_option_aria({ name })}
      renderIcon={(name) => {
        const Icon = getStatusIcon(name)
        return (
          <Icon className="size-3.5" style={color ? { color } : undefined} />
        )
      }}
      footer={
        onColorChange ? (
          <div
            className={cn(
              "grid grid-cols-8 gap-1",
              !iconLocked && "mt-2 border-t border-border pt-2"
            )}
          >
            {TAG_COLOR_WHEEL.map((swatch) => (
              <button
                key={swatch.hex}
                type="button"
                aria-label={m.color_swatch_aria_label({ hex: swatch.hex })}
                aria-pressed={swatch.hex.toLowerCase() === color?.toLowerCase()}
                onClick={() => onColorChange(swatch.hex)}
                className="flex size-7 items-center justify-center rounded-[8px] transition-all duration-100 hover:bg-hover active:scale-[0.97] aria-pressed:bg-active"
              >
                <span
                  className="size-4 rounded-full border border-border/60"
                  style={{ backgroundColor: swatch.oklch }}
                />
              </button>
            ))}
          </div>
        ) : null
      }
    />
  )
}
