import {
  createContext,
  useLayoutEffect,
  useRef,
  type Dispatch,
  type SetStateAction
} from "react"

import type { RowSource, Target } from "./RowMenus"

// Rows register their latest data on every render, so a menu that stays
// open follows edits made from it.
export const createRowSources = () => {
  const sources = new WeakMap<Element, RowSource>()
  const listeners = new Set<(ticketRow: Element) => void>()
  return {
    get: (ticketRow: Element) => sources.get(ticketRow),
    set: (ticketRow: Element, source: RowSource) => {
      sources.set(ticketRow, source)
      for (const listener of listeners) listener(ticketRow)
    },
    subscribe: (listener: (ticketRow: Element) => void) => {
      listeners.add(listener)
      return () => void listeners.delete(listener)
    }
  }
}

type RowSources = ReturnType<typeof createRowSources>

export const RowSources = createContext<RowSources | null>(null)

// Keeps a menu's row data and anchor current while it is mounted, closing
// animation included.
export function useFollowRow<T extends Target>(
  sources: RowSources,
  target: T | null,
  setTarget: Dispatch<SetStateAction<T | null>>,
  anchorOf?: (target: T, ticketRow: Element) => HTMLElement
) {
  const latest = useRef({ target, anchorOf })
  useLayoutEffect(() => {
    latest.current = { target, anchorOf }
  })
  useLayoutEffect(
    () =>
      sources.subscribe((ticketRow) => {
        const followed = latest.current.target
        if (followed === null || !ticketRow.contains(followed.row)) return
        setTarget((current) => {
          if (current === null) return current
          const source = sources.get(ticketRow) ?? current.source
          const anchor =
            latest.current.anchorOf?.(current, ticketRow) ?? current.anchor
          return source === current.source && anchor === current.anchor
            ? current
            : { ...current, source, anchor }
        })
      }),
    [sources, setTarget]
  )
}
