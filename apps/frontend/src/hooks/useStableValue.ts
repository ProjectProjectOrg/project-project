import { useState } from "react"

/**
 * The same object for as long as its contents stay the same (compared as
 * JSON, so for plain data only). A context value built fresh on every
 * render (a list's search, rebuilt as its tickets change) otherwise renders
 * every consumer again, every row of the list.
 */
export function useStableValue<T>(value: T) {
  const [stable, setStable] = useState(value)
  if (JSON.stringify(stable) === JSON.stringify(value)) return stable
  setStable(value)
  return value
}
