import { useState, type ReactNode } from "react"

import { Button } from "./button"
import { Popover, PopoverContent, PopoverTrigger } from "./popover"

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
}>

/*
 * A ghost square that opens a grid of icons, eight to a row. Each cell is a
 * ghost square too, its corners concentric with the popup's (19px popup,
 * 5px inset, 14px cell); the current icon is pressed. Draw the icons in the
 * colour they'll be used in, so the grid previews the result. Picking
 * closes the grid.
 *
 *   <IconGridPicker value={icon} options={ICONS} onChange={setIcon}
 *     triggerIcon={<Glyph icon={icon} />} renderIcon={(name) => <Glyph icon={name} />}
 *     triggerLabel={m.icon_aria()} optionLabel={(name) => name} />
 */
export function IconGridPicker<K extends string>({
  value,
  options,
  onChange,
  renderIcon,
  triggerIcon,
  triggerLabel,
  optionLabel,
  onOpenChange,
  disabled = false
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
        render={<Button type="button" variant="ghost" size="square-8" />}
      >
        {triggerIcon}
      </PopoverTrigger>
      <PopoverContent align="start" sideOffset={6} className="w-auto p-[5px]">
        <div className="grid max-h-60 [scrollbar-gutter:stable] grid-cols-[repeat(8,1.75rem)] gap-1 overflow-x-hidden overflow-y-auto">
          {options.map((name) => (
            <Button
              key={name}
              type="button"
              variant="ghost"
              size="square-7"
              aria-label={optionLabel(name)}
              aria-pressed={name === value}
              onClick={() => {
                onChange(name)
                changeOpen(false)
              }}
            >
              {renderIcon(name)}
            </Button>
          ))}
        </div>
      </PopoverContent>
    </Popover>
  )
}
