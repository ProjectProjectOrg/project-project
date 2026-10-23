import { createContext, use } from "react"

export const PageBackdropContext = createContext<HTMLElement | null>(null)

const scrollTimelinesSupported =
  globalThis.CSS?.supports?.("animation-timeline: scroll()") ?? false

export function usePageBackdrop(): HTMLElement | null {
  const slot = use(PageBackdropContext)
  return scrollTimelinesSupported ? slot : null
}
