// Project detail React context — the layout loads the project once and
// publishes it for child routes (tickets / about / members) to consume.
// Files under `_authed/projects/$slug/` prefixed with `-` are excluded from
// the route tree by TanStack convention; this is a regular module sharing
// state between the layout and its children.

import { createContext, useContext } from "react"
import type { ProjectDetail } from "@projectproject/shared"

export const ProjectContext = createContext<ProjectDetail | null>(null)

export function useProject(): ProjectDetail {
  const v = useContext(ProjectContext)
  if (!v) throw new Error("useProject must be inside ProjectContext")
  return v
}
