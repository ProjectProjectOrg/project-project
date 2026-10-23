import {
  createContext,
  useCallback,
  useContext,
  useLayoutEffect,
  useMemo,
  useState,
  type ReactNode
} from "react"

type SlotRole = "primary" | "section"
type Entries = ReadonlyArray<[string, ReactNode]>

type SlotContext = {
  primary: ReactNode | null
  section: ReactNode | null
  setContent: (role: SlotRole, key: string, node: ReactNode | null) => void
}

const Ctx = createContext<SlotContext | null>(null)

const DrawerAutoCloseCtx = createContext<(() => void) | null>(null)

export const SidebarDrawerAutoCloseProvider = DrawerAutoCloseCtx.Provider

export function useSuppressSidebarAutoClose() {
  return useContext(DrawerAutoCloseCtx)
}

const lastValue = (entries: Entries): ReactNode | null =>
  entries.length > 0 ? entries[entries.length - 1][1] : null

export function SidebarSlotProvider({ children }: { children: ReactNode }) {
  const [primaryEntries, setPrimaryEntries] = useState<Entries>([])
  const [sectionEntries, setSectionEntries] = useState<Entries>([])

  const setContent = useCallback(
    (role: SlotRole, key: string, node: ReactNode | null) => {
      const setter = role === "primary" ? setPrimaryEntries : setSectionEntries
      setter((prev) => {
        const filtered = prev.filter(([k]) => k !== key)
        return node === null ? filtered : [...filtered, [key, node]]
      })
    },
    []
  )

  const primary = lastValue(primaryEntries)
  const section = lastValue(sectionEntries)
  const value = useMemo(
    () => ({ primary, section, setContent }),
    [primary, section, setContent]
  )
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}

export function useSidebarSlotContent(): ReactNode | null {
  const ctx = useContext(Ctx)
  if (!ctx) throw new Error("useSidebarSlotContent outside provider")
  return ctx.primary
}

export function useSidebarSectionContent(): ReactNode | null {
  const ctx = useContext(Ctx)
  if (!ctx) throw new Error("useSidebarSectionContent outside provider")
  return ctx.section
}

function useSlot(role: SlotRole, key: string, render: () => ReactNode) {
  const ctx = useContext(Ctx)
  if (!ctx) throw new Error("useSidebarSlot outside provider")
  const { setContent } = ctx
  useLayoutEffect(() => {
    setContent(role, key, render())
    return () => setContent(role, key, null)
  }, [role, key, render, setContent])
}

export function useSidebarSlot(key: string, render: () => ReactNode) {
  useSlot("primary", key, render)
}

export function useSidebarSection(key: string, render: () => ReactNode) {
  useSlot("section", key, render)
}
