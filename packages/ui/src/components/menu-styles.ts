import { createContext, use } from "react"

// The floating surface every click-opened popup shares (menus, selects,
// popovers, pickers, the composer): the tooltip's raised skin, like hover
// cards. --tooltip fill with the --tooltip-edge hairline and top light, no
// border or drop shadow, so everything that floats reads as one family.
// 19px squircle corners. It's a surface (theme.css), so fields and the
// menu highlight inside step from the popup's fill. The edge is drawn on a
// layer above the content: as the popup's own inset shadow, a tinted child
// (the composer's tray, cmd+k's list) would paint over it.
export const popupSurfaceClass =
  "relative isolate origin-[var(--transform-origin)] rounded-[19px] surface-(--tooltip) text-foreground outline-none [corner-shape:var(--button-corner)] after:pointer-events-none after:absolute after:inset-0 after:z-20 after:rounded-[inherit] after:shadow-(--tooltip-edge) after:[corner-shape:var(--button-corner)]"

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

// For a menu opened at the pointer (a context menu): no slide, only the
// fade and zoom out of the pointer, so the menu never sweeps under it and
// highlights a row (or opens a submenu) on its way in.
export const atPointerMotionClass =
  "[--tw-enter-translate-x:0]! [--tw-enter-translate-y:0]!"

// Rows sit 5px in, so the popup's 19px corners are concentric with a row's
// 14px highlight.
export const menuSurfaceClass = `relative max-h-[var(--available-height)] min-w-[8rem] overflow-x-hidden overflow-y-auto p-[5px] select-none ${popupSurfaceClass}`

export const menuPopupClass = `${menuSurfaceClass} ${popupMotionClass}`

export const menuItemClass =
  "relative flex cursor-pointer items-center gap-2 rounded-md [corner-shape:var(--button-corner)] border-y border-transparent bg-clip-padding px-2 py-[7px] text-body font-[450] text-(--menu-foreground) outline-hidden [&_svg]:text-muted-foreground lit:[&_svg]:text-foreground transition-colors lit:text-foreground lit:duration-0 data-[disabled]:pointer-events-none data-[disabled]:opacity-50 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg]:transition-[stroke-width,color] [&_svg]:duration-80 lit:[&_svg]:stroke-[2] lit:[&_svg]:duration-0 [&_svg:not([class*='size-'])]:size-4"

export const destructiveItemClass =
  "data-[variant=destructive]:text-destructive data-[variant=destructive]:lit:text-destructive data-[variant=destructive]:[&_svg]:text-destructive!"

export const menuLabelClass = "px-2 py-1.5 text-caption text-muted-foreground"

export const menuSeparatorClass =
  "-mx-[5px] my-1 h-px bg-border/60 first:hidden last:hidden [[data-menu-chrome]+&]:hidden"

export const menuChoiceItemClass =
  "data-[checked]:bg-menu-active data-[checked]:text-foreground data-[selected]:bg-menu-active data-[selected]:text-foreground"

export const menuChoiceIndicatorClass =
  "invisible ml-auto flex size-4 shrink-0 items-center justify-center [[data-checked]>&]:visible [[data-menu-meta]+&]:ml-2 [[data-selected]>&]:visible"

export const menuItemMetaClass =
  "ml-auto text-micro text-muted-foreground tabular-nums"

// A quieter detail at a picker row's end, in the row's own size: a
// sprint's dates, an epic's progress. Right-aligned so the details line up
// in one column whatever the names' lengths, and it brightens with its row
// to keep its contrast on the highlight. Pair it with data-menu-meta, so a
// number key after it sits beside it.
export const menuItemDetailClass =
  "ml-auto flex shrink-0 items-center gap-1.5 pl-2 text-right text-muted-foreground tabular-nums [:is([data-highlighted],[data-menu-held],[data-menu-resting])_&]:text-foreground"
