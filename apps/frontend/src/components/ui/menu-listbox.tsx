import type { ComponentProps, ReactNode } from "react"

import { MenuHighlight } from "@/components/ui/menu-highlight"
import { menuItemClass, menuPopupClass } from "@/components/ui/menu-styles"
import { cn } from "@/lib/utils"

export type ListboxState = Readonly<{
  id: string
  open: boolean
  activeIndex: number | null
}>

export const optionId = (listboxId: string, index: number) =>
  `${listboxId}-option-${index}`

export const comboboxProps = (listbox: ListboxState | null) =>
  ({
    role: "combobox",
    "aria-autocomplete": "list",
    "aria-expanded": listbox?.open ?? false,
    "aria-controls": listbox?.open ? listbox.id : undefined,
    "aria-activedescendant":
      listbox?.open && listbox.activeIndex !== null
        ? optionId(listbox.id, listbox.activeIndex)
        : undefined
  }) as const

export function MenuListbox({
  className,
  children,
  ...props
}: ComponentProps<"div">) {
  return (
    <div
      role="listbox"
      className={cn(
        menuPopupClass,
        "absolute inset-x-0 top-full z-30 mt-1 max-h-72",
        className
      )}
      {...props}
    >
      <MenuHighlight />
      {children}
    </div>
  )
}

export function MenuOption({
  id,
  highlighted,
  onHighlight,
  onSelect,
  children
}: Readonly<{
  id: string
  highlighted: boolean
  onHighlight: () => void
  onSelect: () => void
  children: ReactNode
}>) {
  return (
    <button
      id={id}
      type="button"
      role="option"
      tabIndex={-1}
      aria-selected={highlighted}
      data-highlighted={highlighted ? "" : undefined}
      onMouseDown={(event) => {
        event.preventDefault()
        onSelect()
      }}
      onMouseEnter={onHighlight}
      className={cn(menuItemClass, "w-full text-left")}
    >
      {children}
    </button>
  )
}
