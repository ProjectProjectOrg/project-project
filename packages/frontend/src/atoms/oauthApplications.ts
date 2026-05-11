// Connected agents (registered OAuth clients) — list + revoke.
//
// One base atom fetches the list; a function atom revokes by id and refreshes
// the base. The base is wrapped with `Atom.optimistic` so the revoke flow can
// later be upgraded to optimistic if it turns out to feel sluggish — for now
// we just refresh after the server confirms.

import { Atom, Result } from "@effect-atom/atom-react"
import * as Effect from "effect/Effect"
import { runtime } from "@/runtime"
import { ApiClient } from "@/services/ApiClient"

const oauthApplicationsBaseAtom = runtime
  .atom(
    Effect.gen(function* () {
      const client = yield* ApiClient
      return yield* client.oauthApplications.list()
    })
  )
  .pipe(Atom.setIdleTTL("2 minutes"))

export const oauthApplicationsAtom = Atom.optimistic(oauthApplicationsBaseAtom)

type RevokeInput = { id: string }
export const revokeOAuthApplicationAtom = Atom.optimisticFn(
  oauthApplicationsAtom,
  {
    reducer: (current, input: RevokeInput) => {
      if (!Result.isSuccess(current)) return current
      const next = current.value.filter((a) => a.id !== input.id)
      return Result.success(next, { waiting: true })
    },
    fn: runtime.fn(
      Effect.fn(function* (input: RevokeInput, get) {
        const client = yield* ApiClient
        yield* client.oauthApplications.revoke({ path: { id: input.id } })
        get.refresh(oauthApplicationsBaseAtom)
      })
    )
  }
)
