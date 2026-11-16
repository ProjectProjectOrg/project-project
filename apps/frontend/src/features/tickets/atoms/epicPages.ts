import * as Atom from "effect/reactivity/Atom"

import type { EpicSectionsRequest } from "./epicSections"

export const epicLoadedPages = Atom.family((_req: EpicSectionsRequest) =>
  Atom.make<Readonly<Record<string, number>>>({}).pipe(
    Atom.setIdleTTL("2 minutes")
  )
)
