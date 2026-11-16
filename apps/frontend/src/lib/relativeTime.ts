import * as DateTime from "effect/DateTime"

import { m } from "@/paraglide/messages"
import { getLocale } from "@/paraglide/runtime"

const UNITS: Array<[Intl.RelativeTimeFormatUnit, number]> = [
  ["year", 60 * 60 * 24 * 365],
  ["month", 60 * 60 * 24 * 30],
  ["week", 60 * 60 * 24 * 7],
  ["day", 60 * 60 * 24],
  ["hour", 60 * 60],
  ["minute", 60]
]

export function formatRelative(date: Date): string {
  const rtf = new Intl.RelativeTimeFormat(getLocale(), { numeric: "auto" })
  const diff =
    (date.getTime() - DateTime.toEpochMillis(DateTime.nowUnsafe())) / 1000
  for (const [unit, secs] of UNITS) {
    if (Math.abs(diff) >= secs) {
      return rtf.format(Math.round(diff / secs), unit)
    }
  }
  return rtf.format(Math.round(diff), "second")
}

const COMPACT_UNITS: ReadonlyArray<readonly ["minute" | "hour", number]> = [
  ["hour", 60 * 60],
  ["minute", 60]
]

const DAY_SECS = 60 * 60 * 24

const SAME_YEAR: Intl.DateTimeFormatOptions = { month: "short", day: "numeric" }
const OTHER_YEAR: Intl.DateTimeFormatOptions = { ...SAME_YEAR, year: "numeric" }

export function formatCompact(date: Date, now: Date): string {
  const locale = getLocale()
  const secs = Math.max(0, (now.getTime() - date.getTime()) / 1000)
  if (secs < DAY_SECS) {
    const unit = COMPACT_UNITS.find(([, size]) => secs >= size)
    if (unit === undefined) return m.common_time_now()
    return new Intl.NumberFormat(locale, {
      style: "unit",
      unit: unit[0],
      unitDisplay: "narrow"
    }).format(Math.floor(secs / unit[1]))
  }
  if (secs < DAY_SECS * 6)
    return date.toLocaleDateString(locale, { weekday: "short" })
  return date.toLocaleDateString(
    locale,
    date.getFullYear() === now.getFullYear() ? SAME_YEAR : OTHER_YEAR
  )
}
