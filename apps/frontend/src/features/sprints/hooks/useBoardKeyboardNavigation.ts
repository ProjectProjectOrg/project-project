import { useHotkey } from "@tanstack/react-hotkeys"
import {
  createContext,
  useCallback,
  useContext,
  useLayoutEffect,
  useRef,
  useState,
  type KeyboardEvent,
  type RefObject
} from "react"

import { useReturnToTicket } from "@/features/tickets/hooks/useReturnToTicket"
import { useKeyboardMode } from "@/hooks/useKeyboardMode"
import { appHotkeys } from "@/lib/appHotkeys"

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

  const enter = (arrow: boolean) => (event: globalThis.KeyboardEvent) => {
    const target = event.target
    if (target instanceof Node && ref.current?.contains(target)) return
    if (arrow && target !== document.body) return
    event.preventDefault()
    startKeyboardMode()
    controller.current?.enter(event.key)
  }
  const manual = {
    enabled,
    preventDefault: false,
    stopPropagation: false
  } as const
  const arrows = { ...manual, scope: "board" } as const
  useHotkey(appHotkeys["board.left"], enter(false), manual)
  useHotkey(appHotkeys["board.down"], enter(false), manual)
  useHotkey(appHotkeys["board.up"], enter(false), manual)
  useHotkey(appHotkeys["board.right"], enter(false), manual)
  useHotkey("ArrowLeft", enter(true), arrows)
  useHotkey("ArrowDown", enter(true), arrows)
  useHotkey("ArrowUp", enter(true), arrows)
  useHotkey("ArrowRight", enter(true), arrows)

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
