import { Atom } from "@effect-atom/atom-react"
import * as Effect from "effect/Effect"
import { runtime } from "@/runtime"
import { ApiClient } from "@/services/ApiClient"

export const userOrgsAtom = runtime
  .atom(
    Effect.gen(function* () {
      const client = yield* ApiClient
      return yield* client.org.myOrgs()
    })
  )
  .pipe(Atom.setIdleTTL("1 minute"))
