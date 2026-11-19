const pressedByCode = new Map<string, string>()
const litByKey = new Map<string, ReadonlyArray<Element>>()
let installed = false
let pending: Readonly<{ key: string; timer: number }> | null = null

const SEQUENCE_TIMEOUT_MS = 1000

export const keyName = (event: KeyboardEvent) =>
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

const fieldText = (target: EventTarget | null) => {
  if (target instanceof HTMLInputElement) return target.value
  if (target instanceof HTMLTextAreaElement) return target.value
  if (target instanceof HTMLElement && target.isContentEditable)
    return target.textContent ?? ""
  return null
}

// A character typed into a text field is text, not a shortcut, and so is
// deleting from one that has text (Backspace on an empty field is a
// shortcut: cmd+k's ticket chip).
export const typesText = (event: KeyboardEvent) => {
  const text = fieldText(event.target)
  if (text === null) return false
  if (event.key === "Backspace" || event.key === "Delete") return text !== ""
  return (
    event.key.length === 1 && !event.metaKey && !event.ctrlKey && !event.altKey
  )
}

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

export const installKeyCapHighlight = () => {
  if (installed) return
  installed = true
  document.addEventListener("keydown", onKeyDown, true)
  document.addEventListener("keyup", onKeyUp, true)
  window.addEventListener("blur", clear)
}
