export const ownsKeystrokes = (target: EventTarget | null): boolean =>
  target instanceof HTMLElement &&
  (target.isContentEditable ||
    target instanceof HTMLInputElement ||
    target instanceof HTMLTextAreaElement ||
    target instanceof HTMLSelectElement ||
    target.closest('[role="menu"], [role="listbox"], [role="dialog"]') !== null)

export const hasModifier = (event: KeyboardEvent): boolean =>
  event.metaKey || event.ctrlKey || event.altKey || event.shiftKey

export const isKeyboardNavigating = (element: Element | null): boolean =>
  element?.closest("[data-keyboard-navigation]") != null
