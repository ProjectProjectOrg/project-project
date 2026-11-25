export const isMenuBackdrop = (target: EventTarget | null) =>
  target instanceof Element && target.hasAttribute("data-base-ui-inert")

export const belowMenuBackdrop = (event: globalThis.MouseEvent) =>
  document
    .elementsFromPoint(event.clientX, event.clientY)
    .find((element) => !isMenuBackdrop(element))

export const forwardThroughMenuBackdrop = (event: globalThis.MouseEvent) => {
  const below = belowMenuBackdrop(event)
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
