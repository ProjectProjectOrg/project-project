import * as Cause from "effect/Cause"
import * as HttpClientError from "effect/http/HttpClientError"
import * as Option from "effect/Option"
import * as AsyncResult from "effect/reactivity/AsyncResult"
import * as Atom from "effect/reactivity/Atom"
import type * as AtomRegistry from "effect/reactivity/AtomRegistry"
import * as Result from "effect/Result"

import { Api } from "./Api"

export const streamedKeys = Atom.make<ReadonlySet<unknown>>(new Set())

const focusUnlessStreamed = (keys: ReadonlyArray<unknown>) =>
  Atom.readable((get) => {
    const focus = get(Atom.windowFocusSignal)
    const streamed = get.once(streamedKeys)
    return keys.some((key) => streamed.has(key))
      ? Option.getOrElse(get.self<number>(), () => focus)
      : focus
  })

const revalidate = (keys: ReadonlyArray<unknown>) =>
  Atom.swr({
    staleTime: "30 seconds",
    revalidateOnMount: true,
    revalidateOnFocus: true,
    focusSignal: focusUnlessStreamed(keys)
  })

const unreachable = <E>(cause: Cause.Cause<E>) => {
  if (Cause.hasFails(cause)) return false
  const die = Cause.findDie(cause)
  return (
    Result.isSuccess(die) &&
    HttpClientError.isHttpClientError(die.success.defect) &&
    die.success.defect.reason._tag === "TransportError"
  )
}

const keepLoadedWhenUnreachable = <A, E>(
  result: AsyncResult.AsyncResult<A, E>
) =>
  AsyncResult.isFailure(result) && unreachable(result.cause)
    ? Option.getOrElse(result.previousSuccess, () => result)
    : result

const reactivityKeysOf = ({
  reactivityKeys
}: Readonly<{ reactivityKeys?: unknown }>) => {
  const keys: ReadonlyArray<unknown> = Array.isArray(reactivityKeys)
    ? reactivityKeys
    : []
  return keys
}

const revalidating = new WeakMap<object, unknown>()
const sources = new WeakMap<object, Atom.Atom<unknown>>()
const querySources = new WeakSet<Atom.Atom<unknown>>()

export const query = ((
  ...[group, endpoint, request]: Parameters<typeof Api.query>
) => {
  const source = Api.query(
    group,
    endpoint,
    Object.assign(
      {
        timeToLive: "30 minutes",
        serializationKey: JSON.stringify(request)
      },
      request
    )
  )
  const known = revalidating.get(source)
  if (known !== undefined) return known
  const wrapped = revalidate(reactivityKeysOf(request))(source).pipe(
    Atom.map(keepLoadedWhenUnreachable)
  )
  revalidating.set(source, wrapped)
  sources.set(wrapped, source)
  querySources.add(source)
  return wrapped
}) as unknown as typeof Api.query

export const isQuerySource = (atom: Atom.Atom<unknown>) =>
  querySources.has(atom)

export const preloadKey = (atom: Atom.Atom<unknown>) => {
  const source = sources.get(atom)
  return source !== undefined && Atom.isSerializable(source)
    ? source[Atom.SerializableTypeId].key
    : null
}

export const preloadQuery = <A, E>(
  registry: AtomRegistry.AtomRegistry,
  atom: Atom.Atom<AsyncResult.AsyncResult<A, E>>,
  value: A
) => {
  const source = sources.get(atom)
  if (source === undefined || !Atom.isSerializable(source)) return null
  const { key, encode } = source[Atom.SerializableTypeId]
  if (registry.getNodes().has(key)) return null
  registry.setSerializable(key, encode(AsyncResult.success(value)))
  return key
}
