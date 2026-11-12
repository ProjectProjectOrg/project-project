import type { ReactNode } from "react"

import { Checkbox } from "@/components/ui/checkbox"
import { DropdownMenuItem } from "@/components/ui/dropdown-menu"

export function CheckboxMenuItem({
  label,
  checked,
  onToggle,
  children
}: Readonly<{
  label: string
  checked: boolean
  onToggle: () => void
  children: ReactNode
}>) {
  return (
    <DropdownMenuItem
      label={label}
      closeOnClick={false}
      onClick={onToggle}
      className="group cursor-pointer"
    >
      <Checkbox
        aria-label={label}
        variant="quiet"
        className="opacity-0 group-data-[highlighted]:opacity-100 group-data-[menu-resting]:opacity-100 focus-visible:opacity-100 data-[checked]:opacity-100"
        checked={checked}
        onCheckedChange={onToggle}
        onClick={(event) => event.stopPropagation()}
      />
      {children}
    </DropdownMenuItem>
  )
}
