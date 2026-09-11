import * as AsyncResult from "effect/unstable/reactivity/AsyncResult"

type AnyResult = AsyncResult.AsyncResult<any, any>

/**
 * Combine several `AsyncResult`s that back one rendered region.
 *
 * `Atom.optimistic` only drops its overlay when the wrapped source emits a
 * non-waiting Success with a timestamp at least as new as the optimistic value.
 * A region assembled from several queries must therefore report `waiting: true`
 * while any of them is in flight, and carry the newest contributing timestamp.
 * Getting this wrong reintroduces the flicker this whole design removes.
 */
export const Results = {
  /** The first part that is not a Success, or `undefined` when all succeeded. */
  blocked: <E>(
    parts: ReadonlyArray<AsyncResult.AsyncResult<unknown, E>>
  ): AsyncResult.AsyncResult<never, E> | undefined => {
    for (const part of parts) {
      if (!AsyncResult.isSuccess(part)) {
        return part as AsyncResult.AsyncResult<never, E>
      }
    }
    return undefined
  },

  /** Waiting if any part is waiting; timestamp is the newest across parts. */
  meta: (
    parts: ReadonlyArray<AnyResult>
  ): { readonly waiting: boolean; readonly timestamp: number } => {
    let waiting = false
    let timestamp = 0
    for (const part of parts) {
      if (part.waiting) waiting = true
      if (AsyncResult.isSuccess(part) && part.timestamp > timestamp) {
        timestamp = part.timestamp
      }
    }
    return { waiting, timestamp }
  }
} as const
