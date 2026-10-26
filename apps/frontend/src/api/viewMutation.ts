import * as Cause from "effect/Cause"
import type * as Duration from "effect/Duration"
import * as Effect from "effect/Effect"
import * as AsyncResult from "effect/reactivity/AsyncResult"
import * as Atom from "effect/reactivity/Atom"
import * as Registry from "effect/reactivity/AtomRegistry"
import * as Reactivity from "effect/reactivity/Reactivity"

import { Api } from "./Api"
import type { ReactivityKey } from "./keys"

export type OptimisticView<V, E = unknown> = Atom.Writable<
  AsyncResult.AsyncResult<V, E>,
  Atom.Atom<AsyncResult.AsyncResult<AsyncResult.AsyncResult<V, E>, unknown>>
>

export type ViewMutation<V, Input, A, E> = Readonly<{
  name: string
  predict: (value: V, input: Input) => V
  call: (
    input: Input,
    get: Atom.FnContext
  ) => Effect.Effect<A, E, Api | Reactivity.Reactivity>
  confirm: (value: V, confirmed: A, input: Input) => V
  publish?: (confirmed: A, input: Input) => ReadonlyArray<ReactivityKey>
}>

const publish = (keys: ReadonlyArray<ReactivityKey> | undefined) =>
  keys === undefined || keys.length === 0
    ? Effect.void
    : Reactivity.invalidate(keys)

export const viewMutation = <V, VE, Input, A, E>(
  view: OptimisticView<V, VE>,
  mutation: ViewMutation<V, Input, A, E>
) =>
  Atom.optimisticFn(view, {
    reducer: (current, input: Input) =>
      AsyncResult.map(current, (value) => mutation.predict(value, input)),
    fn: (set) =>
      Api.runtime.fn(
        Effect.fn(mutation.name)(function* (input: Input, get) {
          const confirmed = yield* mutation.call(input, get)
          set(
            AsyncResult.map(get(view), (value) =>
              mutation.confirm(value, confirmed, input)
            )
          )
          yield* publish(mutation.publish?.(confirmed, input))
          return confirmed
        })
      )
  })

export type CoalescingMutation<V, Patch, A, E> = Readonly<{
  name: string
  idleTTL: Duration.Input
  predict: (value: V, patch: Patch) => V
  call: (payload: Patch) => Effect.Effect<A, E, Api | Reactivity.Reactivity>
  confirm: (value: V, confirmed: A, payload: Patch) => V
  publish?: (confirmed: A, payload: Patch) => ReadonlyArray<ReactivityKey>
}>

export const coalescingMutation = <V, VE, Patch extends object, A, E>(
  view: OptimisticView<V, VE>,
  mutation: CoalescingMutation<V, Patch, A, E>
) => {
  const unsaved = Atom.make<Partial<Patch>>({}).pipe(
    Atom.setIdleTTL(mutation.idleTTL)
  )
  return Atom.optimisticFn(view, {
    reducer: (current, patch: Patch) =>
      AsyncResult.map(current, (value) => mutation.predict(value, patch)),
    fn: (set) =>
      Api.runtime.fn(
        Effect.fn(mutation.name)(function* (patch: Patch, get) {
          const payload: Patch = { ...get(unsaved), ...patch }
          get.set(unsaved, payload)
          const confirmed = yield* Effect.catchCause(
            mutation.call(payload),
            (cause) => {
              if (!Cause.hasInterruptsOnly(cause) && get(unsaved) === payload) {
                get.set(unsaved, {})
              }
              return Effect.failCause(cause)
            }
          )
          if (get(unsaved) === payload) get.set(unsaved, {})
          set(
            AsyncResult.map(get(view), (value) =>
              mutation.confirm(value, confirmed, payload)
            )
          )
          yield* publish(mutation.publish?.(confirmed, payload))
          return confirmed
        })
      )
  })
}

export const replaceWith = <V>(_current: V, confirmed: V): V => confirmed

export const keepPredicted = <V>(current: V): V => current

export const bindRowMutation = <Req, Id, A extends object>(
  family: (key: Readonly<{ req: Req; id: Id }>) => A
) => Atom.family((req: Req) => (id: Id) => family({ req, id }))

export const fireMutation = <A, E, I>(
  registry: Registry.AtomRegistry,
  atom: Atom.Writable<AsyncResult.AsyncResult<A, E>, I>,
  input: I
): Promise<AsyncResult.AsyncResult<A, E>> => {
  const unmount = registry.mount(atom)
  registry.set(atom, input)
  return Effect.runPromiseExit(
    Registry.getResult(registry, atom, { suspendOnWaiting: true })
  )
    .then(() => registry.get(atom))
    .finally(unmount)
}
