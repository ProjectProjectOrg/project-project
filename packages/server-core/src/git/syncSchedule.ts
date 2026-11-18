import * as DateTime from "effect/DateTime"
import * as Duration from "effect/Duration"

export type SyncLoad = "open_pull_requests" | "branches" | "settled"

export type SyncTiming = Readonly<{
  now: Date
  load: SyncLoad
  lastActivityAt: Date | null
  failures: number
  retryAt: Date | null
}>

const ACTIVE_WINDOW = Duration.minutes(30)
const MAX_BACKOFF = Duration.minutes(30)

const intervalFor = (timing: SyncTiming) => {
  if (timing.failures > 0) {
    return Duration.min(
      Duration.times(Duration.minutes(1), 2 ** (timing.failures - 1)),
      MAX_BACKOFF
    )
  }
  if (timing.load === "settled") return Duration.hours(1)
  if (timing.load === "branches") return Duration.minutes(30)
  const recentlyActive =
    timing.lastActivityAt !== null &&
    timing.now.getTime() - timing.lastActivityAt.getTime() <
      Duration.toMillis(ACTIVE_WINDOW)
  return recentlyActive ? Duration.minutes(1) : Duration.minutes(5)
}

export const nextSyncAt = (timing: SyncTiming) =>
  DateTime.toDate(
    DateTime.makeUnsafe(
      Math.max(
        timing.now.getTime() + Duration.toMillis(intervalFor(timing)),
        timing.retryAt?.getTime() ?? 0
      )
    )
  )
