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
        className="size-4.5 rounded-[4px] bg-transparent opacity-0 shadow-[inset_0_0_0_1px_color-mix(in_oklch,var(--muted-foreground)_55%,transparent)] group-data-[highlighted]:opacity-100 group-data-[menu-resting]:opacity-100 focus-visible:opacity-100 data-[checked]:opacity-100"
        checked={checked}
        onCheckedChange={onToggle}
        onClick={(event) => event.stopPropagation()}
      />
      {children}
    </DropdownMenuItem>
  )
}
