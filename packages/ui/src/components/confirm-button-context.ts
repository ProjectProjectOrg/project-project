import { createContext, use } from "react"

export type ConfirmButtonContextValue = Readonly<{
  state: "idle" | "confirming"
  active: string | null
  open: (key?: string) => void
  close: () => void
  busy: boolean
  setBusy: (b: boolean) => void
  // Inline confirm steps take the trigger's place in the layout instead of
  // sliding over the row as a capsule.
  flow: boolean
  // The trigger's width when the step opened; the capsule grows from it.
  fromWidth: number
}>

export const ConfirmButtonContext =
  createContext<ConfirmButtonContextValue | null>(null)

export function useConfirmButton() {
  const ctx = use(ConfirmButtonContext)
  if (!ctx) {
    throw new Error("useConfirmButton must be used inside <ConfirmButton.Root>")
  }
  return ctx
}
