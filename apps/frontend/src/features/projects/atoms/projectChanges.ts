import * as Effect from "effect/Effect"
import * as Atom from "effect/reactivity/Atom"
import * as Reactivity from "effect/reactivity/Reactivity"

import { Api } from "@/api/Api"
import type { ReactivityKey } from "@/api/keys"

export const invalidateProjectKeys = Api.runtime.fn(
  Effect.fnUntraced(function* (keys: ReadonlyArray<ReactivityKey>) {
    const reactivity = yield* Reactivity.Reactivity
    Atom.batch(() => reactivity.invalidateUnsafe(keys))
  })
)
