import * as Cause from "effect/Cause"
import * as AsyncResult from "effect/reactivity/AsyncResult"
import type * as Atom from "effect/reactivity/Atom"

import { projectScope } from "@/api/keys"

import { localActive } from "./localActive"
import { localReady } from "./localProject"

export const withDefects = <A, E>(
  result: AsyncResult.AsyncResult<A, E>
): AsyncResult.AsyncResult<A> => {
  if (AsyncResult.isInitial(result)) return AsyncResult.initial(result.waiting)
  if (AsyncResult.isSuccess(result)) return AsyncResult.success(result.value)
  return AsyncResult.failure(Cause.die(Cause.squash(result.cause)))
}

export const localValue = <A, E>(
  result: AsyncResult.AsyncResult<A | null, E>
): AsyncResult.AsyncResult<A> =>
  AsyncResult.flatMap(withDefects(result), (value, previous) =>
    value === null
      ? AsyncResult.initial<A>(true)
      : AsyncResult.success(value, previous)
  )

export const localRead = (
  get: Atom.AtomContext,
  params: Readonly<{ orgSlug: string; slug: string }>
): boolean =>
  get(localActive(projectScope(params.orgSlug, params.slug))) &&
  get(localReady({ orgSlug: params.orgSlug, slug: params.slug })) !== false

export const readLocal = <A, E>(
  get: Atom.AtomContext,
  params: Readonly<{ orgSlug: string; slug: string }>,
  local: () => Atom.Atom<AsyncResult.AsyncResult<A | null, E>>
): AsyncResult.AsyncResult<A> | null =>
  localRead(get, params) ? localValue(get(local())) : null
