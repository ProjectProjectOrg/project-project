import { RegistryContext } from "@effect/atom-react"
import * as Effect from "effect/Effect"
import type * as AsyncResult from "effect/unstable/reactivity/AsyncResult"
import type * as Atom from "effect/unstable/reactivity/Atom"
import * as AtomRegistry from "effect/unstable/reactivity/AtomRegistry"
import { useCallback, useContext, useState } from "react"

export const usePullToRefresh = <A, E>(
  atom: Atom.Atom<AsyncResult.AsyncResult<A, E>>
) => {
  const registry = useContext(RegistryContext)
  const [refreshing, setRefreshing] = useState(false)
  const onRefresh = useCallback(() => {
    setRefreshing(true)
    registry.refresh(atom)
    void Effect.runPromise(
      AtomRegistry.getResult(registry, atom, { suspendOnWaiting: true }).pipe(
        Effect.ignore
      )
    ).finally(() => setRefreshing(false))
  }, [registry, atom])
  return { refreshing, onRefresh }
}
