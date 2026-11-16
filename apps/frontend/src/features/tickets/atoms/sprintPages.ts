import * as Atom from "effect/reactivity/Atom"

import type { SprintSectionsRequest } from "./sprintSections"

export const sprintLoadedPages = Atom.family((_req: SprintSectionsRequest) =>
  Atom.make<Readonly<Record<string, number>>>({}).pipe(
    Atom.setIdleTTL("2 minutes")
  )
)
