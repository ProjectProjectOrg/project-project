const pressedByCode = new Map<string, string>()
const litByKey = new Map<string, ReadonlyArray<Element>>()
let installed = false
let pending: Readonly<{ key: string; timer: number }> | null = null

const SEQUENCE_TIMEOUT_MS = 1000

export const keyName = (event: KeyboardEvent): string =>
  event.key === " " ? "space" : event.key.toLowerCase()

const light = (key: string) => {
  const caps = Array.from(
    document.querySelectorAll(`[data-key="${key.replace(/["\\]/g, "\\$&")}"]`)
  )
  for (const cap of caps) cap.setAttribute("data-pressed", "")
  if (caps.length > 0) litByKey.set(key, caps)
}

const unlight = (key: string) => {
  for (const cap of litByKey.get(key) ?? []) cap.removeAttribute("data-pressed")
  litByKey.delete(key)
}

const clearPending = () => {
  if (pending === null) return
  window.clearTimeout(pending.timer)
  unlight(pending.key)
  pending = null
}

const clear = () => {
  clearPending()
  for (const key of litByKey.keys()) unlight(key)
  pressedByCode.clear()
}

// A character typed into a text field is text, not a shortcut.
export const typesText = (event: KeyboardEvent): boolean =>
  event.key.length === 1 &&
  !event.metaKey &&
  !event.ctrlKey &&
  !event.altKey &&
  event.target instanceof HTMLElement &&
  (event.target.isContentEditable ||
    event.target instanceof HTMLInputElement ||
    event.target instanceof HTMLTextAreaElement)

const onKeyDown = (event: KeyboardEvent) => {
  if (event.repeat || typesText(event)) return
  clearPending()
  const key = keyName(event)
  pressedByCode.set(event.code, key)
  light(key)
}

const onKeyUp = (event: KeyboardEvent) => {
  if (event.key === "Meta") {
    clear()
    return
  }
  const key = pressedByCode.get(event.code)
  if (key === undefined) return
  pressedByCode.delete(event.code)
  const startsSequence = (litByKey.get(key) ?? []).some((cap) =>
    cap.hasAttribute("data-sequence-start")
  )
  if (!startsSequence) {
    unlight(key)
    return
  }
  pending = {
    key,
    timer: window.setTimeout(clearPending, SEQUENCE_TIMEOUT_MS)
  }
}

export const installKeyCapHighlight = (): void => {
  if (installed) return
  installed = true
  document.addEventListener("keydown", onKeyDown, true)
  document.addEventListener("keyup", onKeyUp, true)
  window.addEventListener("blur", clear)
}
