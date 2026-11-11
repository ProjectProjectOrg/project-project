import * as Result from "effect/reactivity/AsyncResult"
import { useState } from "react"

export function useSettledValue<A>(
  result: Result.AsyncResult<A, unknown>,
  fallback: A
): A {
  const [settled, setSettled] = useState(fallback)
  if (Result.isSuccess(result) && result.value !== settled) {
    setSettled(result.value)
  }
  return Result.isSuccess(result) ? result.value : settled
}
