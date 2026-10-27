import type * as Context from "effect/Context"
import type * as Duration from "effect/Duration"
import * as Effect from "effect/Effect"
import * as AsyncResult from "effect/reactivity/AsyncResult"
import * as Atom from "effect/reactivity/Atom"
import * as Registry from "effect/reactivity/AtomRegistry"
import * as Reactivity from "effect/reactivity/Reactivity"
import * as Semaphore from "effect/Semaphore"

import { Api } from "./Api"
import type { ReactivityKey } from "./keys"

export type OptimisticView<V, E = unknown> = Atom.Writable<
  AsyncResult.AsyncResult<V, E>,
  Atom.Atom<AsyncResult.AsyncResult<AsyncResult.AsyncResult<V, E>, unknown>>
>

export type ApiClient = Context.Service.Shape<typeof Api>

type CallContext = Api | Reactivity.Reactivity

export type ViewMutation<V, Input, A, E> = Readonly<{
  name: string
  predict: (value: V, input: Input) => V
  call: (
    client: ApiClient,
    input: Input,
    get: Atom.FnContext
  ) => Effect.Effect<A, E, CallContext>
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
          const confirmed = yield* Api.use((client) =>
            mutation.call(client, input, get)
          )
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
  merge?: (pending: NoInfer<Patch>, next: NoInfer<Patch>) => NoInfer<Patch>
  predict: (value: V, patch: Patch) => V
  call: (client: ApiClient, payload: Patch) => Effect.Effect<A, E, CallContext>
  confirm: (value: V, confirmed: A, payload: Patch) => V
  publish?: (confirmed: A, payload: Patch) => ReadonlyArray<ReactivityKey>
}>

export const coalescingMutation = <V, VE, Patch extends object, A, E>(
  view: OptimisticView<V, VE>,
  mutation: CoalescingMutation<V, Patch, A, E>
) => {
  const pending = Atom.make<
    Readonly<{ token: object; patch: Patch | undefined }>
  >({
    token: {},
    patch: undefined
  }).pipe(Atom.setIdleTTL(mutation.idleTTL))
  const gate = Atom.make((get) => {
    let active = true
    get.addFinalizer(() => {
      active = false
    })
    return {
      semaphore: Semaphore.makeUnsafe(1),
      isActive: () => active,
      registry: get.registry
    }
  }).pipe(Atom.setIdleTTL(mutation.idleTTL))
  const result = Atom.optimisticFn(view, {
    reducer: (current, patch: Patch) =>
      AsyncResult.map(current, (value) => mutation.predict(value, patch)),
    fn: (set) =>
      Api.runtime.fn(
        Effect.fn(mutation.name)(function* (patch: Patch, get) {
          const previous = get(pending).patch
          const payload =
            previous === undefined
              ? patch
              : mutation.merge
                ? mutation.merge(previous, patch)
                : { ...previous, ...patch }
          const token = {}
          get.registry.set(pending, { token, patch: payload })
          const queue = get(gate)
          return yield* queue.semaphore.withPermit(
            Effect.uninterruptible(
              Effect.gen(function* () {
                if (
                  !queue.isActive() ||
                  get.registry.get(pending).token !== token
                )
                  return yield* Effect.interrupt
                get.registry.set(pending, { token, patch: undefined })
                const confirmed = yield* Api.use((client) =>
                  mutation.call(client, payload)
                )
                if (!queue.isActive()) return confirmed
                if (get.registry.get(pending).token === token) {
                  set(
                    AsyncResult.map(get(view), (value) =>
                      mutation.confirm(value, confirmed, payload)
                    )
                  )
                } else {
                  get.registry.refresh(view)
                }
                yield* publish(mutation.publish?.(confirmed, payload))
                return confirmed
              })
            )
          )
        })
      )
  })
  return Atom.writable(
    (get) => get(result),
    (ctx, input: Patch | Atom.Reset | Atom.Interrupt) => {
      const registry = ctx.get(gate).registry
      const unmountView = registry.mount(view)
      const unmountPending = registry.mount(pending)
      const unmountGate = registry.mount(gate)
      void fireMutation(registry, result, input).finally(() => {
        unmountView()
        unmountPending()
        unmountGate()
      })
    }
  )
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
