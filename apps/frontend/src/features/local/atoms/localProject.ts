import * as Effect from "effect/Effect"
import * as AsyncResult from "effect/reactivity/AsyncResult"
import * as Atom from "effect/reactivity/Atom"

import { Api } from "@/api/Api"
import { me } from "@/features/auth/atoms/auth"

import { createLocalProject } from "../lib/localProject"
import { persistenceFor } from "../lib/persistence"

export type LocalScope = Readonly<{ orgSlug: string; slug: string }>

export const localProject = Atom.family((scope: LocalScope) =>
  Api.runtime
    .atom((get) =>
      Effect.gen(function* () {
        const client = yield* Api
        const viewer = get.once(me())
        const userId = AsyncResult.isSuccess(viewer) ? viewer.value.id : "anon"
        const persistence = yield* Effect.promise(() => persistenceFor(userId))
        const local = createLocalProject({ client, scope, persistence })
        get.addFinalizer(() => {
          void local.rows.cleanup()
          void local.details.cleanup()
          void local.groups.cleanup()
        })
        return local
      })
    )
    .pipe(Atom.setIdleTTL("10 minutes"))
)
