import {
  createContext,
  useLayoutEffect,
  useRef,
  type Dispatch,
  type SetStateAction
} from "react"

import type { RowSource, Target } from "./RowMenus"

export const createRowSources = () => {
  const sources = new WeakMap<Element, RowSource>()
  const listeners = new Set<(ticketRow: Element, removed: boolean) => void>()
  const notify = (ticketRow: Element, removed: boolean) => {
    for (const listener of listeners) listener(ticketRow, removed)
  }
  return {
    get: (ticketRow: Element) => sources.get(ticketRow),
    set: (ticketRow: Element, source: RowSource) => {
      sources.set(ticketRow, source)
      notify(ticketRow, false)
    },
    drop: (ticketRow: Element) =>
      queueMicrotask(() => {
        if (!ticketRow.isConnected) notify(ticketRow, true)
      }),
    subscribe: (listener: (ticketRow: Element, removed: boolean) => void) => {
      listeners.add(listener)
      return () => void listeners.delete(listener)
    }
  }
}

type RowSources = ReturnType<typeof createRowSources>

export const RowSources = createContext<RowSources | null>(null)

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
      sources.subscribe((ticketRow, removed) => {
        const followed = latest.current.target
        if (followed === null || !ticketRow.contains(followed.row)) return
        if (removed) {
          setTarget(null)
          return
        }
        setTarget((current) => {
          if (current === null || !ticketRow.contains(current.row))
            return current
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
