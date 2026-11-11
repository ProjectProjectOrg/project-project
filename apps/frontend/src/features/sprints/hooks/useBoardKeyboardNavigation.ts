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

import {
  createBoardKeyboardNavigation,
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
  const [context] = useState(() => ({
    registerColumn: (status: string, column: BoardKeyboardColumn) => {
      columns.current.set(status, column)
      controller.current?.refresh()
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
    return () => {
      controller.current = null
      navigation.dispose()
    }
  }, [enabled, ref])

  const onKeyDown = useCallback((event: KeyboardEvent<HTMLDivElement>) => {
    controller.current?.onKeyDown(event.nativeEvent)
  }, [])

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
