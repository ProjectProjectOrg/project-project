import { createContext, use } from "react"

export const PageBackdropContext = createContext<HTMLElement | null>(null)

export function usePageBackdrop(): HTMLElement | null {
  return use(PageBackdropContext)
}
