import * as DateTime from "effect/DateTime"

export const maxDeliveryAgeMs = 24 * 60 * 60 * 1000
export const minSendIntervalMs = 1000
export const disableAfterFailures = 10
export const disableAfterFailingMs = 6 * 60 * 60 * 1000
export const disableAfterGone = 3

const at = (ms: number) => DateTime.toDate(DateTime.makeUnsafe(ms))

export type AttemptResult =
  | Readonly<{
      _tag: "Response"
      status: number
      retryAfterSeconds: number | null
      excerpt: string | null
    }>
  | Readonly<{
      _tag: "Failure"
      reason:
        | "timeout"
        | "connection"
        | "dns"
        | "tls"
        | "blocked_address"
        | "invalid_url"
        | "configuration"
    }>

export type Classification = Readonly<{
  state: "delivered" | "pending" | "failed"
  outcome: string
  gone: boolean
  retryAfterSeconds: number | null
}>

export const classify = (result: AttemptResult): Classification => {
  if (result._tag === "Failure")
    return {
      state:
        result.reason === "blocked_address" || result.reason === "invalid_url"
          ? "failed"
          : "pending",
      outcome: result.reason,
      gone: false,
      retryAfterSeconds: null
    }
  const { status } = result
  if (status >= 200 && status < 300)
    return {
      state: "delivered",
      outcome: "delivered",
      gone: false,
      retryAfterSeconds: null
    }
  if (status === 408 || status === 429 || status >= 500)
    return {
      state: "pending",
      outcome: `http_${status}`,
      gone: false,
      retryAfterSeconds: result.retryAfterSeconds
    }
  return {
    state: "failed",
    outcome: status >= 300 && status < 400 ? "redirect" : `http_${status}`,
    gone: status === 404 || status === 410,
    retryAfterSeconds: null
  }
}

export const parseRetryAfter = (
  value: string | null,
  now: Date
): number | null => {
  if (value === null || value.trim() === "") return null
  const seconds = Number(value)
  if (Number.isFinite(seconds) && seconds >= 0)
    return Math.min(Math.ceil(seconds), maxDeliveryAgeMs / 1000)
  const date = Date.parse(value)
  if (Number.isNaN(date)) return null
  return Math.min(
    Math.max(0, Math.ceil((date - now.getTime()) / 1000)),
    maxDeliveryAgeMs / 1000
  )
}

export const backoffSeconds = (failureCount: number) =>
  Math.min(3600, 10 * 2 ** Math.max(0, failureCount - 1))

export type EndpointHealth = Readonly<{
  failureCount: number
  failingSince: Date | null
  goneCount: number
}>

export type EndpointUpdate = EndpointHealth &
  Readonly<{
    nextAttemptAt: Date
    lastSuccessAt: Date | null
    disable: "gone" | "failing" | null
  }>

export const afterAttempt = (
  health: EndpointHealth,
  classification: Classification,
  now: Date
): EndpointUpdate => {
  const floor = at(now.getTime() + minSendIntervalMs)
  if (classification.state === "delivered")
    return {
      failureCount: 0,
      failingSince: null,
      goneCount: 0,
      nextAttemptAt: floor,
      lastSuccessAt: now,
      disable: null
    }
  const failureCount = health.failureCount + 1
  const failingSince = health.failingSince ?? now
  const goneCount = classification.gone ? health.goneCount + 1 : 0
  const delaySeconds = Math.max(
    backoffSeconds(failureCount),
    classification.retryAfterSeconds ?? 0
  )
  const disable =
    goneCount >= disableAfterGone
      ? "gone"
      : failureCount >= disableAfterFailures &&
          now.getTime() - failingSince.getTime() >= disableAfterFailingMs
        ? "failing"
        : null
  return {
    failureCount,
    failingSince,
    goneCount,
    nextAttemptAt: at(
      Math.max(floor.getTime(), now.getTime() + delaySeconds * 1000)
    ),
    lastSuccessAt: null,
    disable
  }
}
