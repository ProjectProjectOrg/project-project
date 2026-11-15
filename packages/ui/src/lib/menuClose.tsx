import { createContext, use, useMemo, useRef, type RefObject } from "react"

// What an item can do to its whole menu (root and any submenus): close it
// later, e.g. after an async action it started has finished, and hold it
// open meanwhile, so Escape, an outside click or hovering off a submenu
// can't close it under a running action. DropdownMenu and ContextMenu
// provide it from their root.
type MenuControl = Readonly<{
  close: () => void
  hold: (held: boolean) => void
  held: () => boolean
}>

type MenuActions = Readonly<{ close: () => void }>

type CancelableDetails = Readonly<{ cancel: () => void }>

const MenuControlContext = createContext<MenuControl | null>(null)

export const MenuControlProvider = MenuControlContext

// The root's actionsRef (the caller's, or one of our own), the control its
// items get, and an onOpenChange that refuses to close while held.
export function useMenuRoot<T extends MenuActions, D extends CancelableDetails>(
  given: RefObject<T | null> | undefined,
  onOpenChange: ((open: boolean, details: D) => void) | undefined
) {
  const own = useRef<T | null>(null)
  const ref = given ?? own
  // A count, not a flag: two items can be running at once, and the first
  // to finish mustn't release the other's hold.
  const holds = useRef(0)
  const control = useMemo<MenuControl>(
    () => ({
      close: () => ref.current?.close(),
      hold: (held) => {
        holds.current = Math.max(0, holds.current + (held ? 1 : -1))
      },
      held: () => holds.current > 0
    }),
    [ref]
  )
  return {
    ref,
    control,
    onOpenChange: guardOpenChange(control, onOpenChange)
  }
}

// A submenu's onOpenChange that also stays open while its menu is held.
export function useHeldOpenChange<D extends CancelableDetails>(
  onOpenChange: ((open: boolean, details: D) => void) | undefined
) {
  const control = use(MenuControlContext)
  return control === null
    ? onOpenChange
    : guardOpenChange(control, onOpenChange)
}

const guardOpenChange =
  <D extends CancelableDetails>(
    control: MenuControl,
    onOpenChange: ((open: boolean, details: D) => void) | undefined
  ) =>
  (open: boolean, details: D) => {
    if (!open && control.held()) return details.cancel()
    onOpenChange?.(open, details)
  }

// The control of the menu this item is in; does nothing outside one.
export function useMenuControl(): MenuControl {
  return use(MenuControlContext) ?? detached
}

const detached: MenuControl = {
  close: () => {},
  hold: () => {},
  held: () => false
}
