import { createContext, use } from "react"

export const ReadSinceContext = createContext<Date | null>(null)

export const useIsNewSinceRead = (at: Date): boolean => {
  const since = use(ReadSinceContext)
  return since !== null && at.getTime() > since.getTime()
}
