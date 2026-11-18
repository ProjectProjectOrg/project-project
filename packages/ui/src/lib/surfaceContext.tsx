import { createContext, useContext, type ReactNode } from "react"

// No provider means the page itself, which reads as level 1.
const SurfaceContext = createContext<number | null>(null)

export function useSurface() {
  return useContext(SurfaceContext) ?? 1
}

// True outside any SurfaceProvider: the element sits on the page itself.
export function useOnPage() {
  return useContext(SurfaceContext) === null
}

export function SurfaceProvider({
  value,
  children
}: {
  value: number
  children: ReactNode
}) {
  return (
    <SurfaceContext.Provider value={Math.max(1, Math.min(8, value))}>
      {children}
    </SurfaceContext.Provider>
  )
}
