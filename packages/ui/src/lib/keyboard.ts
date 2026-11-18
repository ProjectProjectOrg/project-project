export const ownsKeystrokes = (target: EventTarget | null) =>
  target instanceof HTMLElement &&
  (target.isContentEditable ||
    target instanceof HTMLInputElement ||
    target instanceof HTMLTextAreaElement ||
    target instanceof HTMLSelectElement ||
    target.closest('[role="menu"], [role="listbox"], [role="dialog"]') !== null)

export const hasModifier = (event: KeyboardEvent) =>
  event.metaKey || event.ctrlKey || event.altKey || event.shiftKey

export const isKeyboardNavigating = (element: Element | null) =>
  element?.closest("[data-keyboard-navigation]") != null
