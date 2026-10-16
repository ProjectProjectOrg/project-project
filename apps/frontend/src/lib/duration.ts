import { m } from "@/paraglide/messages"

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

export const parseDurationToSeconds = (input: string): number | null => {
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

export const formatDuration = (seconds: number): string => {
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

export const formatWorkDuration = (seconds: number): string => {
  let remaining = Math.max(0, Math.round(seconds / MINUTE)) * MINUTE
  if (remaining === 0) return m.time_duration_minutes({ minutes: 0 })
  const take = (unit: number) => {
    const count = Math.floor(remaining / unit)
    remaining -= count * unit
    return count
  }
  const weeks = take(WEEK)
  const days = take(DAY)
  const hours = take(HOUR)
  const minutes = take(MINUTE)
  return [
    ...(weeks > 0 ? [m.time_duration_weeks({ weeks })] : []),
    ...(days > 0 ? [m.time_duration_days({ days })] : []),
    ...(hours > 0 ? [m.time_duration_hours({ hours })] : []),
    ...(minutes > 0 ? [m.time_duration_minutes({ minutes })] : [])
  ].join(" ")
}
