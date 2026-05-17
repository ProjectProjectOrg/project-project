import {
  createContext,
  useCallback,
  useContext,
  useLayoutEffect,
  useMemo,
  useState,
  type ReactNode
} from "react"

type SlotContext = {
  content: ReactNode | null
  setContent: (key: string, node: ReactNode | null) => void
}

const Ctx = createContext<SlotContext | null>(null)

export function SidebarSlotProvider({ children }: { children: ReactNode }) {
  const [entries, setEntries] = useState<ReadonlyArray<[string, ReactNode]>>([])

  const setContent = useCallback((key: string, node: ReactNode | null) => {
    setEntries((prev) => {
      const filtered = prev.filter(([k]) => k !== key)
      return node === null ? filtered : [...filtered, [key, node]]
    })
  }, [])

  const content = entries.length > 0 ? entries[entries.length - 1][1] : null
  const value = useMemo(() => ({ content, setContent }), [content, setContent])
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}

export function useSidebarSlotContent(): ReactNode | null {
  const ctx = useContext(Ctx)
  if (!ctx) throw new Error("useSidebarSlotContent outside provider")
  return ctx.content
}

export function useSidebarSlot(key: string, render: () => ReactNode) {
  const ctx = useContext(Ctx)
  if (!ctx) throw new Error("useSidebarSlot outside provider")
  const { setContent } = ctx
  useLayoutEffect(() => {
    setContent(key, render())
    return () => setContent(key, null)
  }, [key, render, setContent])
}
