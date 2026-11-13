import type { InboxItem } from "@pp/shared"
import { useEffect, useEffectEvent, type RefObject } from "react"

import type { InboxActions } from "@/features/inbox/hooks/useInboxActions"
import { inboxKey, stepRow } from "@/features/inbox/lib/inboxRows"
import { hasModifier, ownsKeystrokes } from "@/lib/keyboard"

const STEPS = new Map<string, 1 | -1>([
  ["j", 1],
  ["k", -1]
])
const LIST_STEPS = new Map<string, 1 | -1>([
  ["ArrowDown", 1],
  ["ArrowUp", -1]
])
const ROW_KEYS: ReadonlyMap<string, "done" | "toggleUnread" | "openTicket"> =
  new Map([
    ["e", "done"],
    ["u", "toggleUnread"],
    ["o", "openTicket"]
  ])

const focusRow = (list: HTMLElement | null, item: InboxItem) => {
  const key = CSS.escape(inboxKey(item))
  requestAnimationFrame(() =>
    list?.querySelector<HTMLElement>(`[data-inbox-row="${key}"]`)?.focus()
  )
}

export function useInboxKeys(
  items: ReadonlyArray<InboxItem>,
  selected: InboxItem | null,
  actions: InboxActions,
  listRef: RefObject<HTMLElement | null>
) {
  const onKeyDown = useEffectEvent((event: KeyboardEvent) => {
    if (event.defaultPrevented || hasModifier(event)) return
    if (ownsKeystrokes(event.target)) return
    const inList =
      event.target instanceof Node &&
      listRef.current?.contains(event.target) === true
    const step =
      STEPS.get(event.key) ?? (inList ? LIST_STEPS.get(event.key) : undefined)
    if (step !== undefined) {
      event.preventDefault()
      const next = stepRow(
        items,
        selected === null ? null : inboxKey(selected),
        step
      )
      if (next === null || next === selected) return
      actions.select(next, true)
      if (inList) focusRow(listRef.current, next)
      return
    }
    const action = ROW_KEYS.get(event.key)
    if (action === undefined || selected === null) return
    event.preventDefault()
    actions[action](selected)
  })
  useEffect(() => {
    const listener = (event: KeyboardEvent) => onKeyDown(event)
    document.addEventListener("keydown", listener)
    return () => document.removeEventListener("keydown", listener)
  }, [])
}
