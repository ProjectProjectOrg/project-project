import { createContext, use, useRef, type RefObject } from "react"

// Lets an item close its whole menu (root and any submenus) later, e.g.
// after an async action it started has finished. DropdownMenu and
// ContextMenu provide it from their root's actionsRef.
type MenuActions = Readonly<{ close: () => void }>

const MenuCloseContext = createContext<(() => void) | null>(null)

export const MenuCloseProvider = MenuCloseContext

// The root's actionsRef: the caller's, or one of our own.
export function useMenuActionsRef<T extends MenuActions>(
  given: RefObject<T | null> | undefined
) {
  const own = useRef<T | null>(null)
  const ref = given ?? own
  return { ref, close: () => ref.current?.close() }
}

// Closes the menu this item is in; does nothing outside one.
export function useCloseMenu(): () => void {
  return use(MenuCloseContext) ?? noop
}

const noop = () => {}
