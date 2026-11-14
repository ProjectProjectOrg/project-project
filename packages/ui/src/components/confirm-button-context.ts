import { createContext, use } from "react"

export type ConfirmButtonContextValue = Readonly<{
  state: "idle" | "confirming"
  active: string | null
  open: (key?: string) => void
  close: () => void
  busy: boolean
  setBusy: (b: boolean) => void
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
