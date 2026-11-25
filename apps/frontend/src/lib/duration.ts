import { perLocale } from "@/lib/perLocale"
import { m } from "@/paraglide/messages"
import { getLocale } from "@/paraglide/runtime"

const durationList = perLocale(Intl.ListFormat, {
  style: "long",
  type: "unit"
})

export const WORK_DAY_HOURS = 8
export const WORK_WEEK_DAYS = 5

const MINUTE = 60
const HOUR = 60 * MINUTE
const DAY = WORK_DAY_HOURS * HOUR
const WEEK = WORK_WEEK_DAYS * DAY

const amount = String.raw`(\d+(?:\.\d+)?)`
const DURATION_PATTERN = new RegExp(
  String.raw`^(?:${amount}\s*w)?\s*(?:${amount}\s*d)?\s*(?:${amount}\s*h)?\s*(?:${amount}\s*m)?$`
)

export const parseDurationToSeconds = (input: string) => {
  const trimmed = input.trim().toLowerCase()
  if (trimmed.length === 0) return null
  if (/^\d+(\.\d+)?$/.test(trimmed)) {
    const minutes = Number.parseFloat(trimmed)
    return minutes > 0 ? Math.round(minutes * MINUTE) : null
  }
  const match = DURATION_PATTERN.exec(trimmed)
  if (match === null) return null
  const [, weeks, days, hours, minutes] = match
  const parts: ReadonlyArray<readonly [string | undefined, number]> = [
    [weeks, WEEK],
    [days, DAY],
    [hours, HOUR],
    [minutes, MINUTE]
  ]
  const total = parts.reduce(
    (sum, [value, unit]) =>
      value === undefined ? sum : sum + Number.parseFloat(value) * unit,
    0
  )
  return total > 0 ? Math.round(total) : null
}

export const formatDuration = (seconds: number) => {
  const total = Math.max(0, Math.round(seconds / 60))
  const hours = Math.floor(total / 60)
  const minutes = total % 60
  if (hours === 0 && minutes === 0)
    return m.time_duration_minutes({ minutes: 0 })
  return [
    ...(hours > 0 ? [m.time_duration_hours({ hours })] : []),
    ...(minutes > 0 ? [m.time_duration_minutes({ minutes })] : [])
  ].join(" ")
}

const workParts = (seconds: number) => {
  let remaining = Math.max(0, Math.round(seconds / MINUTE)) * MINUTE
  const take = (unit: number) => {
    const count = Math.floor(remaining / unit)
    remaining -= count * unit
    return count
  }
  return {
    weeks: take(WEEK),
    days: take(DAY),
    hours: take(HOUR),
    minutes: take(MINUTE)
  }
}

export const formatWorkDuration = (seconds: number) => {
  const { weeks, days, hours, minutes } = workParts(seconds)
  if (weeks + days + hours + minutes === 0)
    return m.time_duration_minutes({ minutes: 0 })
  return [
    ...(weeks > 0 ? [m.time_duration_weeks({ weeks })] : []),
    ...(days > 0 ? [m.time_duration_days({ days })] : []),
    ...(hours > 0 ? [m.time_duration_hours({ hours })] : []),
    ...(minutes > 0 ? [m.time_duration_minutes({ minutes })] : [])
  ].join(" ")
}

const SHORT_UNITS = [
  [WEEK, (weeks: number) => m.time_duration_weeks({ weeks })],
  [DAY, (days: number) => m.time_duration_days({ days })],
  [HOUR, (hours: number) => m.time_duration_hours({ hours })]
] as const

// The largest working unit only, to one decimal below 10 ("45m", "1.5h",
// "2d", "25w"): never wider than four characters, for a row's estimate.
export const formatWorkDurationShort = (seconds: number) => {
  const total = Math.max(0, Math.round(seconds / MINUTE)) * MINUTE
  for (const [size, format] of SHORT_UNITS) {
    if (total < size) continue
    const value = total / size
    return format(value < 10 ? Math.round(value * 10) / 10 : Math.round(value))
  }
  return m.time_duration_minutes({ minutes: total / MINUTE })
}

export const formatWorkDurationLong = (seconds: number) => {
  const { weeks, days, hours, minutes } = workParts(seconds)
  return durationList(getLocale()).format([
    ...(weeks > 0 ? [m.time_duration_weeks_long({ weeks })] : []),
    ...(days > 0 ? [m.time_duration_days_long({ days })] : []),
    ...(hours > 0 ? [m.time_duration_hours_long({ hours })] : []),
    ...(minutes > 0 ? [m.time_duration_minutes_long({ minutes })] : [])
  ])
}
