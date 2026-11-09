import { useAtom } from "@effect/atom-react"
import { useRouterState } from "@tanstack/react-router"
import type * as Atom from "effect/reactivity/Atom"
import { useEffect, useRef, useState } from "react"

export function useRouteBoundDialog<T>(atom: Atom.Writable<T | null>) {
  const [request, setRequest] = useAtom(atom)
  const [shown, setShown] = useState(request)
  if (request !== null && request !== shown) setShown(request)
  const pathname = useRouterState({
    select: (state) => state.location.pathname
  })
  const openedAt = useRef<string | null>(null)
  useEffect(() => {
    if (request === null) {
      openedAt.current = null
      return
    }
    if (openedAt.current === null) {
      openedAt.current = pathname
      return
    }
    if (openedAt.current !== pathname) setRequest(null)
  }, [request, pathname, setRequest])
  return { open: request !== null, shown, close: () => setRequest(null) }
}
