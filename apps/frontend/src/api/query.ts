import * as Cause from "effect/Cause"
import * as HttpClientError from "effect/http/HttpClientError"
import * as Option from "effect/Option"
import * as AsyncResult from "effect/reactivity/AsyncResult"
import * as Atom from "effect/reactivity/Atom"
import * as Result from "effect/Result"

import { Api } from "./Api"

const revalidate = Atom.swr({
  staleTime: "30 seconds",
  revalidateOnMount: true,
  revalidateOnFocus: true,
  focusSignal: Atom.windowFocusSignal
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
): AsyncResult.AsyncResult<A, E> =>
  AsyncResult.isFailure(result) && unreachable(result.cause)
    ? Option.getOrElse(result.previousSuccess, () => result)
    : result

const revalidating = new WeakMap<object, unknown>()

export const query = ((...args: Parameters<typeof Api.query>) => {
  const source = Api.query(...args)
  const known = revalidating.get(source)
  if (known !== undefined) return known
  const wrapped = revalidate(source).pipe(Atom.map(keepLoadedWhenUnreachable))
  revalidating.set(source, wrapped)
  return wrapped
}) as unknown as typeof Api.query
