import type { KeyLabels } from "@pp/ui/kbd"
import * as React from "react"

/*
 * The selection's keys, as the app has them: S, A, P, ⇧S and T open a
 * selected row's property menu (the same keys a single row answers to), N
 * applies the bar's suggestion, and ⌘K opens Actions with the selection.
 */

export const KEY_LABELS: KeyLabels = {
  ctrl: "Ctrl",
  meta: "Win",
  alt: "Alt",
  shift: "Shift",
  enter: "Enter",
  escape: "Esc",
  backspace: "Backspace",
  delete: "Delete",
  tab: "Tab",
  space: "Space"
}

export type Field = "status" | "assignee" | "priority" | "sprint" | "labels"

export const FIELD_KEYS: Readonly<Record<string, Field>> = {
  S: "status",
  A: "assignee",
  P: "priority",
  "Shift+S": "sprint",
  T: "labels"
}

// Applies the suggestion.
export const SUGGESTION_KEYS = "N"

// The keys a press spells ("S", "Shift+S"), or nothing for one the bar
// leaves alone (with a modifier, held down, or typed into a field or menu).
const pressedKeys = (event: KeyboardEvent) => {
  if (event.metaKey || event.ctrlKey || event.altKey || event.repeat)
    return undefined
  const target = event.target
  if (
    target instanceof HTMLElement &&
    target.closest("input, textarea, [role=menu], [role=listbox]") !== null
  )
    return undefined
  const key = event.key.length === 1 ? event.key.toUpperCase() : event.key
  return event.shiftKey ? `Shift+${key}` : key
}

// The bar's keys, while it's up: `onKeys` says whether it took them.
export function useBarKeys(onKeys: (keys: string) => boolean) {
  const handle = React.useEffectEvent((event: KeyboardEvent) => {
    const keys = pressedKeys(event)
    if (keys !== undefined && onKeys(keys)) event.preventDefault()
  })
  React.useEffect(() => {
    const onKey = (event: KeyboardEvent) => handle(event)
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [])
}
