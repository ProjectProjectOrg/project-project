import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type RefObject
} from "react"

export function useKeyboardMode(
  root: RefObject<HTMLElement | null>,
  onMouseMove: (event: PointerEvent, wasNavigating: boolean) => void
): () => void {
  const latest = useRef(onMouseMove)
  useLayoutEffect(() => {
    latest.current = onMouseMove
  })
  const [start] = useState(() => () => {
    if (root.current) root.current.dataset.keyboardNavigation = ""
  })

  useEffect(() => {
    const onPointerMove = (event: PointerEvent) => {
      const element = root.current
      if (
        element === null ||
        event.pointerType !== "mouse" ||
        (event.movementX === 0 && event.movementY === 0)
      )
        return
      const wasNavigating = element.dataset.keyboardNavigation !== undefined
      delete element.dataset.keyboardNavigation
      latest.current(event, wasNavigating)
    }
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Tab" || event.key === "F2")
        root.current?.removeAttribute("data-keyboard-navigation")
    }
    document.addEventListener("pointermove", onPointerMove, { passive: true })
    document.addEventListener("keydown", onKeyDown, true)
    return () => {
      document.removeEventListener("pointermove", onPointerMove)
      document.removeEventListener("keydown", onKeyDown, true)
    }
  }, [root])

  return start
}
