import * as Option from "effect/Option"
import * as AsyncResult from "effect/reactivity/AsyncResult"

export const staleSuccess = <A, E>(
  result: AsyncResult.AsyncResult<A, E>
): Option.Option<AsyncResult.Success<A, E>> =>
  AsyncResult.isFailure(result) ? result.previousSuccess : Option.none()
