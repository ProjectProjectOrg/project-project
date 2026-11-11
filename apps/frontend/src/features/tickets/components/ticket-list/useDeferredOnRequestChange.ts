import * as Equal from "effect/Equal"
import { useDeferredValue } from "react"

export function useDeferredOnRequestChange<
  Snapshot extends Readonly<{ req: unknown }>
>(active: Snapshot | null): Snapshot | null {
  const deferred = useDeferredValue(active)
  if (active === null || deferred === null) return active
  return Equal.equals(active.req, deferred.req) ? active : deferred
}
