import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type KeyboardEvent,
  type RefObject
} from "react"

import { useReturnToTicket } from "@/features/tickets/hooks/useReturnToTicket"
import { useKeyboardMode } from "@/hooks/useKeyboardMode"
import { hasModifier, ownsKeystrokes } from "@/lib/keyboard"

import {
  createBoardKeyboardNavigation,
  isBoardKey,
  ticketPosition,
  type BoardKeyboardColumn
} from "../lib/boardKeyboard"

export const BoardKeyboardContext = createContext<Readonly<{
  registerColumn: (status: string, column: BoardKeyboardColumn) => () => void
}> | null>(null)

export function useBoardKeyboardNavigation(
  ref: RefObject<HTMLDivElement | null>,
  enabled: boolean
) {
  const columns = useRef(new Map<string, BoardKeyboardColumn>())
  const controller = useRef<ReturnType<
    typeof createBoardKeyboardNavigation
  > | null>(null)
  const [focusTicket] = useState(() => (ticketId: string) => {
    const position = ticketPosition(columns.current, ticketId)
    if (position === null || controller.current === null) return false
    controller.current.focus(position)
    return true
  })
  const returnToTicket = useReturnToTicket(focusTicket)
  const startKeyboardMode = useKeyboardMode(ref, (event, wasNavigating) => {
    if (wasNavigating) controller.current?.release()
    if (event.target instanceof HTMLElement)
      controller.current?.point(event.target)
  })
  const [context] = useState(() => ({
    registerColumn: (status: string, column: BoardKeyboardColumn) => {
      columns.current.set(status, column)
      controller.current?.refresh()
      returnToTicket()
      return () => {
        if (columns.current.get(status) === column)
          columns.current.delete(status)
      }
    }
  }))

  useLayoutEffect(() => {
    if (!enabled || !ref.current) return undefined
    const navigation = createBoardKeyboardNavigation(
      ref.current,
      columns.current
    )
    controller.current = navigation
    returnToTicket()
    return () => {
      controller.current = null
      navigation.dispose()
    }
  }, [enabled, ref, returnToTicket])

  useEffect(() => {
    if (!enabled) return undefined
    const onKeyDown = (event: globalThis.KeyboardEvent) => {
      const target = event.target
      if (
        event.defaultPrevented ||
        !isBoardKey(event.key) ||
        hasModifier(event) ||
        ownsKeystrokes(target) ||
        (target instanceof Node && ref.current?.contains(target)) ||
        (event.key.startsWith("Arrow") && target !== document.body)
      )
        return
      event.preventDefault()
      startKeyboardMode()
      controller.current?.enter(event.key)
    }
    document.addEventListener("keydown", onKeyDown)
    return () => document.removeEventListener("keydown", onKeyDown)
  }, [enabled, ref, startKeyboardMode])

  const onKeyDown = useCallback(
    (event: KeyboardEvent<HTMLDivElement>) => {
      controller.current?.onKeyDown(event.nativeEvent)
      if (event.nativeEvent.defaultPrevented && isBoardKey(event.key))
        startKeyboardMode()
    },
    [startKeyboardMode]
  )

  return { context: enabled ? context : null, onKeyDown }
}

export function useBoardColumnKeyboard(
  status: string,
  ticketIds: ReadonlyArray<string>,
  reveal: (index: number) => void
): void {
  const context = useContext(BoardKeyboardContext)
  useLayoutEffect(
    () => context?.registerColumn(status, { ticketIds, reveal }),
    [context, status, ticketIds, reveal]
  )
}
