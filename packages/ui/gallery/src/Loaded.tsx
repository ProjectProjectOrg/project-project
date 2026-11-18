import { use, type ReactNode } from "react"

import type { Loadable } from "./registry"

// Renders what a loadable holds; it suspends only while it loads.
export function Loaded<T>({
  loadable,
  children
}: Readonly<{ loadable: Loadable<T>; children: (value: T) => ReactNode }>) {
  return children(use(loadable.load()))
}
