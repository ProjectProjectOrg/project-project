import { HotkeysProvider, useHotkey } from "@tanstack/react-hotkeys"
import { useRef, type ReactNode } from "react"

import { useKeyboardMode } from "@/hooks/useKeyboardMode"
import { appHotkeys } from "@/lib/appHotkeys"

const ROW = "[data-sprint-row]"
const LINK = "[data-item-link]"

const shownRows = (root: HTMLElement) =>
  [...root.querySelectorAll<HTMLElement>(ROW)].filter(
    (row) => !row.closest("[inert]")
  )

// The focused row, else the hovered one: what a row key acts on.
const currentRow = (root: HTMLElement) => {
  const focused = document.activeElement
  const row =
    focused instanceof Element && root.contains(focused)
      ? focused.closest<HTMLElement>(ROW)
      : null
  return row ?? root.querySelector<HTMLElement>(`${ROW}:hover`)
}

// J/K step through the sprint rows; O, D and Shift+S press the current row's
// link, dates chip and start button, so a key does what its click does.
export function SprintListKeyboard({
  children
}: Readonly<{ children: ReactNode }>) {
  const root = useRef<HTMLDivElement>(null)
  const startKeyboardMode = useKeyboardMode(root, (_event, wasNavigating) => {
    const focused = document.activeElement
    if (
      wasNavigating &&
      focused instanceof HTMLElement &&
      focused.matches(LINK) &&
      root.current?.contains(focused)
    )
      focused.blur()
  })

  const step = (to: 1 | -1) => () => {
    const element = root.current
    if (element === null) return
    const rows = shownRows(element)
    const current = currentRow(element)
    const index = current === null ? -1 : rows.indexOf(current)
    const next =
      index === -1 ? rows[to === 1 ? 0 : rows.length - 1] : rows[index + to]
    if (next === undefined) return
    startKeyboardMode()
    next.querySelector<HTMLElement>(LINK)?.focus()
  }
  const press = (selector: string) => () => {
    const row = root.current === null ? null : currentRow(root.current)
    row?.querySelector<HTMLElement>(selector)?.click()
  }
  useHotkey(appHotkeys["sprints.focus-next"], step(1))
  useHotkey(appHotkeys["sprints.focus-previous"], step(-1))
  useHotkey(appHotkeys["sprints.open"], press(LINK))
  useHotkey(appHotkeys["sprints.dates"], press("[data-sprint-dates]"))
  useHotkey(appHotkeys["sprints.start"], press("[data-sprint-start]"))

  return (
    <HotkeysProvider scope="sprint-list">
      <div ref={root} className="contents">
        {children}
      </div>
    </HotkeysProvider>
  )
}
