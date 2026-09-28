import * as Console from "effect/Console"
import * as Effect from "effect/Effect"

import { bootstrapOrg } from "../src/bootstrap/org"
import { BootstrapStore, bootstrapInput } from "./lib/bootstrapStore"

const main = Effect.gen(function* () {
  const input = yield* bootstrapInput
  const store = yield* BootstrapStore

  const result = yield* bootstrapOrg(store, input)

  yield* Console.log(
    `[bootstrap-org] org ${state(result.created.org)}: ${result.org.slug}`
  )
  yield* Console.log(
    `[bootstrap-org] owner ${state(result.created.owner)}: ${result.owner.email}`
  )
  yield* Console.log(
    `[bootstrap-org] membership ${state(result.created.membership)}: ${result.membership.role}`
  )
})

function state(created: boolean): string {
  return created ? "created" : "existing"
}

Effect.runPromise(main.pipe(Effect.provide(BootstrapStore.layer))).catch(
  (error) => {
    console.error(error)
    process.exit(1)
  }
)
