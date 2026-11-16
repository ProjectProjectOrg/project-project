import * as Effect from "effect/Effect"
import * as AsyncResult from "effect/reactivity/AsyncResult"
import * as Atom from "effect/reactivity/Atom"

import { Api } from "@/api/Api"
import { me } from "@/features/auth/atoms/auth"

import { persistenceFor } from "../lib/persistence"
import { createLocalTickets } from "../lib/ticketCollection"

export type LocalScope = Readonly<{ orgSlug: string; slug: string }>

export const localTickets = Atom.family((scope: LocalScope) =>
  Api.runtime
    .atom((get) =>
      Effect.gen(function* () {
        const client = yield* Api
        const viewer = get.once(me())
        const userId = AsyncResult.isSuccess(viewer) ? viewer.value.id : "anon"
        const persistence = yield* Effect.promise(() => persistenceFor(userId))
        const local = createLocalTickets({ client, scope, persistence })
        get.addFinalizer(() => void local.collection.cleanup())
        return local
      })
    )
    .pipe(Atom.setIdleTTL("10 minutes"))
)
