import { createContext, use } from "react"

// The floating surface every click-opened popup shares (menus, selects,
// popovers, pickers, the composer): the tooltip's raised skin, like hover
// cards. --tooltip fill with the --tooltip-edge hairline and top light, no
// border or drop shadow, so everything that floats reads as one family.
// 19px squircle corners.
export const popupSurfaceClass =
  "z-50 origin-[var(--transform-origin)] rounded-[19px] bg-(color:--tooltip) text-foreground shadow-(--tooltip-edge) outline-none [corner-shape:var(--button-corner)]"

// Whether content sits inside a popup. Every popup provides it, and a popup
// opened from inside one takes the raised fill (--tooltip-raised).
export const PopupLayerContext = createContext(false)

export function useRaisedPopupClass() {
  return use(PopupLayerContext)
    ? "[--tooltip:var(--tooltip-raised)]"
    : undefined
}

export const popupMotionClass =
  "data-[closed]:animate-out data-[closed]:fade-out-0 data-[closed]:zoom-out-95 data-[open]:animate-in data-[open]:fade-in-0 data-[open]:zoom-in-95 data-[side=bottom]:slide-in-from-top-2 data-[side=left]:slide-in-from-right-2 data-[side=right]:slide-in-from-left-2 data-[side=top]:slide-in-from-bottom-2 motion-reduce:data-[closed]:animate-none motion-reduce:data-[open]:animate-none"

// Rows sit 5px in, so the popup's 19px corners are concentric with a row's
// 14px highlight.
export const menuSurfaceClass = `relative max-h-[var(--available-height)] min-w-[8rem] overflow-x-hidden overflow-y-auto p-[5px] select-none ${popupSurfaceClass}`

export const menuPopupClass = `${menuSurfaceClass} ${popupMotionClass}`

export const menuItemClass =
  "relative flex cursor-pointer items-center gap-2 rounded-md [corner-shape:var(--button-corner)] border-y border-transparent bg-clip-padding px-2 py-[7px] text-body text-(--menu-foreground) outline-hidden [&_svg]:text-muted-foreground lit:[&_svg]:text-foreground transition-colors lit:text-foreground lit:duration-0 data-[disabled]:pointer-events-none data-[disabled]:opacity-50 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg]:transition-[stroke-width,color] [&_svg]:duration-80 lit:[&_svg]:stroke-[2] lit:[&_svg]:duration-0 [&_svg:not([class*='size-'])]:size-4"

export const menuLabelClass = "px-2 py-1.5 text-caption text-muted-foreground"

export const menuSeparatorClass =
  "-mx-[5px] my-1 h-px bg-border/60 first:hidden last:hidden [[data-menu-chrome]+&]:hidden"

export const menuChoiceItemClass =
  "data-[checked]:bg-menu-active data-[checked]:text-foreground data-[selected]:bg-menu-active data-[selected]:text-foreground"

export const menuChoiceIndicatorClass =
  "invisible ml-auto flex size-4 shrink-0 items-center justify-center [[data-checked]>&]:visible [[data-menu-meta]+&]:ml-2 [[data-selected]>&]:visible"

export const menuItemMetaClass =
  "ml-auto text-micro text-muted-foreground tabular-nums"
