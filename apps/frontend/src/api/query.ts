import * as Cause from "effect/Cause"
import * as Option from "effect/Option"
import * as AsyncResult from "effect/reactivity/AsyncResult"
import * as Atom from "effect/reactivity/Atom"

import { Api } from "./Api"

const revalidate = Atom.swr({
  staleTime: "30 seconds",
  revalidateOnMount: true,
  revalidateOnFocus: true,
  focusSignal: Atom.windowFocusSignal
})

const keepLoadedOnDefect = <A, E>(
  result: AsyncResult.AsyncResult<A, E>
): AsyncResult.AsyncResult<A, E> =>
  AsyncResult.isFailure(result) &&
  Cause.hasDies(result.cause) &&
  !Cause.hasFails(result.cause)
    ? Option.getOrElse(result.previousSuccess, () => result)
    : result

const revalidating = new WeakMap<object, unknown>()

export const query = ((...args: Parameters<typeof Api.query>) => {
  const source = Api.query(...args)
  const known = revalidating.get(source)
  if (known !== undefined) return known
  const wrapped = revalidate(source).pipe(Atom.map(keepLoadedOnDefect))
  revalidating.set(source, wrapped)
  return wrapped
}) as unknown as typeof Api.query
