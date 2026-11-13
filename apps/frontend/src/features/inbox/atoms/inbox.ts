import type { TicketId } from "@pp/shared"
import * as Effect from "effect/Effect"
import * as Atom from "effect/reactivity/Atom"

import { Api } from "@/api/Api"

export type TicketReadRequest = Readonly<{
  orgSlug: string
  slug: string
  id: TicketId
}>

export const markTicketRead = Atom.family((req: TicketReadRequest) =>
  Api.runtime.fn(
    Effect.fn("markTicketRead")(function* (_: void) {
      yield* Api.use((client) => client.inbox.markRead({ params: req }))
    })
  )
)
