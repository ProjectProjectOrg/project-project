import * as DateTime from "effect/DateTime"
import { useSyncExternalStore } from "react"

import { perLocale } from "@/lib/perLocale"
import { m } from "@/paraglide/messages"
import { getLocale } from "@/paraglide/runtime"

const relativeTime = perLocale(Intl.RelativeTimeFormat, { numeric: "auto" })

const UNITS: Array<[Intl.RelativeTimeFormatUnit, number]> = [
  ["year", 60 * 60 * 24 * 365],
  ["month", 60 * 60 * 24 * 30],
  ["week", 60 * 60 * 24 * 7],
  ["day", 60 * 60 * 24],
  ["hour", 60 * 60],
  ["minute", 60]
]

const nowMillis = () => DateTime.toEpochMillis(DateTime.nowUnsafe())

// Within a minute either way, since the server's clock may run a little fast.
export function formatRelative(date: Date, now = nowMillis()) {
  const diff = (date.getTime() - now) / 1000
  if (Math.abs(diff) < 60) return m.common_time_just_now()
  const rtf = relativeTime(getLocale())
  for (const [unit, secs] of UNITS) {
    if (Math.abs(diff) >= secs) {
      return rtf.format(Math.round(diff / secs), unit)
    }
  }
  return m.common_time_just_now()
}

const TICK_MS = 30_000
let now = nowMillis()
const listeners = new Set<() => void>()
let timer: number | undefined

const subscribe = (listener: () => void) => {
  listeners.add(listener)
  if (timer === undefined) {
    now = nowMillis()
    timer = window.setInterval(() => {
      now = nowMillis()
      for (const notify of listeners) notify()
    }, TICK_MS)
  }
  return () => {
    listeners.delete(listener)
    if (listeners.size > 0) return
    window.clearInterval(timer)
    timer = undefined
  }
}

export const useNow = () => useSyncExternalStore(subscribe, () => now)
