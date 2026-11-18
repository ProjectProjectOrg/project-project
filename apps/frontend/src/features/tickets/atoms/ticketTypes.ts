import * as AsyncResult from "effect/reactivity/AsyncResult"
import * as Atom from "effect/reactivity/Atom"

import {
  projectLibraryFor,
  type ProjectLibraryRequest
} from "@/features/library/atoms/library"
import { BUILTIN_TYPE_DEFINITIONS } from "@/features/tickets/lib/ticketTypes"

export const projectTicketTypes = Atom.family((req: ProjectLibraryRequest) =>
  Atom.make((get) => {
    const library = get(projectLibraryFor(req))
    return AsyncResult.isSuccess(library)
      ? library.value.types
      : BUILTIN_TYPE_DEFINITIONS
  })
)
