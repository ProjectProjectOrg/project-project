import { createContext, use } from "react"

type SettingsRowIds = Readonly<{
  labelId: string
  descriptionId: string | undefined
}>

export const SettingsRowContext = createContext<SettingsRowIds | null>(null)

export function useSettingsRow() {
  const ids = use(SettingsRowContext)
  if (!ids) throw new Error("useSettingsRow must be used inside SettingsRow")
  return ids
}
