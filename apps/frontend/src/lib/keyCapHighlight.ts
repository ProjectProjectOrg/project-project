const pressedByCode = new Map<string, string>()
const litByKey = new Map<string, ReadonlyArray<Element>>()
let installed = false

const keyName = (event: KeyboardEvent): string =>
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

const clear = () => {
  for (const key of litByKey.keys()) unlight(key)
  pressedByCode.clear()
}

const onKeyDown = (event: KeyboardEvent) => {
  if (event.repeat) return
  const key = keyName(event)
  pressedByCode.set(event.code, key)
  light(key)
}

const onKeyUp = (event: KeyboardEvent) => {
  if (event.key === "Meta") {
    clear()
    return
  }
  unlight(pressedByCode.get(event.code) ?? keyName(event))
  pressedByCode.delete(event.code)
}

export const installKeyCapHighlight = (): void => {
  if (installed) return
  installed = true
  document.addEventListener("keydown", onKeyDown, true)
  document.addEventListener("keyup", onKeyUp, true)
  window.addEventListener("blur", clear)
}
