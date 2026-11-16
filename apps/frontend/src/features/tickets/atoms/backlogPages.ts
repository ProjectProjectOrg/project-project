import * as Atom from "effect/reactivity/Atom"

import type { BacklogRequest } from "./backlog"

export const backlogLoadedPages = Atom.family((_req: BacklogRequest) =>
  Atom.make<Readonly<Record<string, number>>>({}).pipe(
    Atom.setIdleTTL("2 minutes")
  )
)
