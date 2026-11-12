import { createContext, use, useMemo, useState, type ReactNode } from "react"
import { createPortal } from "react-dom"

type ToolbarSlot = Readonly<{
  slot: HTMLElement | null
  setSlot: (slot: HTMLElement | null) => void
}>

const ToolbarSlotContext = createContext<ToolbarSlot | null>(null)

export function ProjectToolbarSlotScope({
  children
}: Readonly<{ children: ReactNode }>) {
  const [slot, setSlot] = useState<HTMLElement | null>(null)
  const value = useMemo(() => ({ slot, setSlot }), [slot])
  return <ToolbarSlotContext value={value}>{children}</ToolbarSlotContext>
}

export function ProjectToolbarSlot({
  className
}: Readonly<{ className?: string }>) {
  const setSlot = use(ToolbarSlotContext)?.setSlot
  return <div ref={setSlot} className={className} />
}

export function ProjectToolbarPortal({
  children
}: Readonly<{ children: ReactNode }>) {
  const slot = use(ToolbarSlotContext)?.slot
  return slot ? createPortal(children, slot) : null
}
