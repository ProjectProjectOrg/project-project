import { useState, type ReactNode } from "react"

import {
  Popover,
  PopoverContent,
  PopoverTrigger
} from "@/components/ui/popover"
import { cn } from "@/lib/utils"

type IconGridPickerProps<K extends string> = Readonly<{
  value: K
  options: ReadonlyArray<K>
  onChange: (value: K) => void
  renderIcon: (name: K) => ReactNode
  triggerIcon: ReactNode
  triggerLabel: string
  optionLabel: (name: K) => string
  onOpenChange?: (open: boolean) => void
  disabled?: boolean
  className?: string
  variant?: "outlined" | "ghost"
  footer?: ReactNode
}>

export function IconGridPicker<K extends string>({
  value,
  options,
  onChange,
  renderIcon,
  triggerIcon,
  triggerLabel,
  optionLabel,
  onOpenChange,
  disabled = false,
  className,
  variant = "outlined",
  footer
}: IconGridPickerProps<K>) {
  const [open, setOpen] = useState(false)
  const changeOpen = (next: boolean) => {
    setOpen(next)
    onOpenChange?.(next)
  }

  return (
    <Popover open={open} onOpenChange={changeOpen}>
      <PopoverTrigger
        disabled={disabled}
        aria-label={triggerLabel}
        className={cn(
          "flex size-8 shrink-0 items-center justify-center rounded-md bg-transparent transition-all duration-100 hover:bg-hover disabled:cursor-not-allowed disabled:opacity-60 data-[popup-open]:bg-active",
          variant === "outlined" && "border border-input",
          className
        )}
      >
        {triggerIcon}
      </PopoverTrigger>
      <PopoverContent align="start" sideOffset={6} className="w-[228px] p-2">
        {options.length > 0 ? (
          <div className="grid max-h-60 grid-cols-8 gap-1 overflow-y-auto">
            {options.map((name) => (
              <button
                key={name}
                type="button"
                aria-label={optionLabel(name)}
                aria-pressed={name === value}
                onClick={() => {
                  onChange(name)
                  changeOpen(false)
                }}
                className="flex size-7 items-center justify-center rounded-[8px] text-muted-foreground transition-all duration-100 hover:bg-hover hover:text-foreground active:scale-[0.97] aria-pressed:bg-active aria-pressed:text-foreground"
              >
                {renderIcon(name)}
              </button>
            ))}
          </div>
        ) : null}
        {footer}
      </PopoverContent>
    </Popover>
  )
}
