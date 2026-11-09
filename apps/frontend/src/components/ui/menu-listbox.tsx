import { useReducedMotion } from "motion/react"
import { useEffect, useRef, type ComponentProps, type ReactNode } from "react"

import { MenuHighlight } from "@/components/ui/menu-highlight"
import { menuItemClass, menuPopupClass } from "@/components/ui/menu-styles"
import { rowScrollTarget, scrollViewportTo } from "@/lib/scrollRowIntoView"
import { cn } from "@/lib/utils"

export type ListboxState = Readonly<{
  id: string
  open: boolean
  activeId: string | null
}>

export const optionId = (listboxId: string, index: number) =>
  `${listboxId}-option-${index}`

export const comboboxProps = (listbox: ListboxState | null) =>
  ({
    role: "combobox",
    "aria-autocomplete": "list",
    "aria-expanded": listbox?.open ?? false,
    "aria-controls": listbox?.open ? listbox.id : undefined,
    "aria-activedescendant": listbox?.open
      ? (listbox.activeId ?? undefined)
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
  const ref = useRef<HTMLButtonElement>(null)
  const hovered = useRef(false)
  const reduceMotion = useReducedMotion() ?? false
  useEffect(() => {
    const row = ref.current
    const viewport = row?.closest<HTMLElement>("[role=listbox]")
    if (!highlighted || hovered.current || !row || !viewport) return undefined
    const style = getComputedStyle(viewport)
    const target = rowScrollTarget(viewport, row, {
      top: Number.parseFloat(style.scrollPaddingTop) || 0,
      bottom: Number.parseFloat(style.scrollPaddingBottom) || 0
    })
    if (target === null) return undefined
    return scrollViewportTo(viewport, target, reduceMotion) ?? undefined
  }, [highlighted, reduceMotion])
  return (
    <button
      ref={ref}
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
      onMouseEnter={() => {
        hovered.current = true
        onHighlight()
      }}
      onMouseLeave={() => {
        hovered.current = false
      }}
      className={cn(menuItemClass, "w-full text-left")}
    >
      {children}
    </button>
  )
}
