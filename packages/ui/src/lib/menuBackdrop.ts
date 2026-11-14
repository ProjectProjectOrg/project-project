export const isMenuBackdrop = (target: EventTarget | null): boolean =>
  target instanceof Element && target.hasAttribute("data-base-ui-inert")

export const forwardThroughMenuBackdrop = (
  event: globalThis.MouseEvent
): boolean => {
  const below = document
    .elementsFromPoint(event.clientX, event.clientY)
    .find((element) => !isMenuBackdrop(element))
  if (below === undefined) return false
  return !below.dispatchEvent(
    new globalThis.MouseEvent("contextmenu", {
      bubbles: true,
      cancelable: true,
      clientX: event.clientX,
      clientY: event.clientY,
      screenX: event.screenX,
      screenY: event.screenY,
      button: 2,
      buttons: 2
    })
  )
}
