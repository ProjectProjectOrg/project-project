import { useState } from "react"

import {
  panelTransition,
  type PanelTransition
} from "@/components/shell/sidebar/sidebarRoute"

// How the sidebar panel changed on the last key change: up/down the rail, or
// into/out of settings. `initial` is the transition for the first render.
export function usePanelTransition(
  key: string,
  order: ReadonlyArray<string>,
  initial: PanelTransition = "none"
): PanelTransition {
  const [state, setState] = useState<
    Readonly<{ key: string; transition: PanelTransition }>
  >({ key, transition: initial })
  if (state.key === key) return state.transition
  const transition = panelTransition(state.key, key, order)
  setState({ key, transition })
  return transition
}
