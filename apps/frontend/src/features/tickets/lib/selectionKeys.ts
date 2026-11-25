import type { TicketId } from "@pp/shared"

import { selectionKey } from "./ticketSelection"

/*
 * With several tickets selected, the rows are the toolbar: a selected row's
 * status, priority, assignee, sprint and labels change every selected
 * ticket (Row's onPatch). Its fields carry data-row-field, so the keys a
 * single row answers to (S, P, A, ⇧S, T) open the same field on the row
 * under the pointer (or the first selected one), and hovering one lights
 * the same field on every selected row (data-lit-field, styles.css).
 */

// The row field each key opens.
const ROW_FIELDS = {
  "tickets.status": "status",
  "tickets.priority": "priority",
  "tickets.assign": "assignee",
  "tickets.sprint": "sprint",
  "tickets.tags": "labels"
} as const

// Opens a selected row's field for a key, pressing its own control; false
// when the key isn't a field's, or the row isn't on screen (⌘K then).
export const openRowField = (
  hotkey: string,
  slug: string,
  selected: ReadonlyArray<Readonly<{ id: TicketId }>>,
  pointed: TicketId | null
) => {
  const field = Object.entries(ROW_FIELDS).find(([id]) => id === hotkey)?.[1]
  if (field === undefined || selected.length < 2) return false
  const row = selected.find((ticket) => ticket.id === pointed) ?? selected[0]
  if (row === undefined) return false
  const control = document
    .querySelector(
      `[data-selection-key="${CSS.escape(selectionKey(slug, row.id))}"]`
    )
    ?.querySelector<HTMLElement>(`[data-row-field="${field}"] button`)
  if (!control) return false
  control.click()
  return true
}

const PAGE_FIELDS = {
  ...ROW_FIELDS,
  "tickets.type": "type",
  "tickets.estimate": "estimate",
  "tickets.parent": "epic"
} as const

export const openPageField = (hotkey: string, ticketId: TicketId) => {
  const field = Object.entries(PAGE_FIELDS).find(([id]) => id === hotkey)?.[1]
  if (field === undefined) return false
  const scope =
    document.querySelector("[data-ticket-composer]") ??
    document.querySelector(`[data-ticket-page="${CSS.escape(ticketId)}"]`)
  const control = scope?.querySelector<HTMLButtonElement>(
    `[data-ticket-field="${field}"] button`
  )
  if (!control || control.disabled) return false
  control.click()
  return true
}

// Lights the field under the pointer (or focus) on every selected row, by
// naming it on the list's root.
export const lightRowFields = (root: HTMLElement) => {
  const light = (event: Event) => {
    const target = event.target
    const field =
      target instanceof Element && target.closest("[data-row-selected]")
        ? target.closest<HTMLElement>("[data-row-field]")?.dataset.rowField
        : undefined
    if (field === undefined) delete root.dataset.litField
    else root.dataset.litField = field
  }
  const clear = () => delete root.dataset.litField
  root.addEventListener("pointerover", light)
  root.addEventListener("focusin", light)
  root.addEventListener("pointerleave", clear)
  root.addEventListener("focusout", clear)
  return () => {
    root.removeEventListener("pointerover", light)
    root.removeEventListener("focusin", light)
    root.removeEventListener("pointerleave", clear)
    root.removeEventListener("focusout", clear)
  }
}
