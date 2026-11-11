import * as DateTime from "effect/DateTime"

export const WEEKDAYS = [
  "sunday",
  "monday",
  "tuesday",
  "wednesday",
  "thursday",
  "friday",
  "saturday"
] as const

const MONTHS = [
  "january",
  "february",
  "march",
  "april",
  "may",
  "june",
  "july",
  "august",
  "september",
  "october",
  "november",
  "december"
] as const

const RELATIVE = /^(?:in\s+)?(\d{1,3})\s*([a-z]+)$/u
const ISO = /^(\d{4})-(\d{1,2})-(\d{1,2})$/u
const NUMERIC = /^(\d{1,2})[/.-](\d{1,2})(?:[/.-](\d{2}|\d{4}))?$/u
const MONTH_DAY = /^([a-z]+)\s+(\d{1,2})$/u
const DAY_MONTH = /^(\d{1,2})\s+([a-z]+)$/u

export const localToday = (now: DateTime.DateTime): DateTime.Zoned =>
  DateTime.startOf(DateTime.setZone(now, DateTime.zoneMakeLocal()), "day")

const isPrefixOf = (word: string, full: string, minLength = 1) =>
  word.length >= minLength && full.startsWith(word)

const named = (
  names: ReadonlyArray<string>,
  word: string,
  minLength: number
): number =>
  word.length < minLength
    ? -1
    : names.findIndex((name) => name.startsWith(word))

const onDay = (
  today: DateTime.Zoned,
  year: number,
  month: number,
  day: number
): DateTime.Zoned | null => {
  const date = DateTime.setParts(today, { year, month, day })
  return DateTime.getPart(date, "month") === month &&
    DateTime.getPart(date, "day") === day
    ? date
    : null
}

const nextOccurrence = (
  today: DateTime.Zoned,
  month: number,
  day: number
): DateTime.Zoned | null => {
  const year = DateTime.getPart(today, "year")
  const thisYear = onDay(today, year, month, day)
  return thisYear !== null && DateTime.isGreaterThanOrEqualTo(thisYear, today)
    ? thisYear
    : onDay(today, year + 1, month, day)
}

const parse = (text: string, today: DateTime.Zoned): DateTime.Zoned | null => {
  const days = (count: number) => DateTime.add(today, { days: count })
  if (isPrefixOf(text, "today", 3)) return today
  if (isPrefixOf(text, "tomorrow", 3) || text === "tmrw") return days(1)
  if (isPrefixOf(text, "week", 2)) return days(7)
  const relative = RELATIVE.exec(text)
  if (relative !== null) {
    const count = Number(relative[1])
    const unit = relative[2]
    if (isPrefixOf(unit, "days")) return days(count)
    if (isPrefixOf(unit, "weeks") || unit === "wk" || unit === "wks") {
      return days(count * 7)
    }
  }
  const weekday = named(WEEKDAYS, text, 2)
  if (weekday !== -1) {
    const ahead = (weekday - DateTime.getPart(today, "weekDay") + 7) % 7
    return days(ahead === 0 ? 7 : ahead)
  }
  const iso = ISO.exec(text)
  if (iso !== null) {
    return onDay(today, Number(iso[1]), Number(iso[2]), Number(iso[3]))
  }
  const numeric = NUMERIC.exec(text)
  if (numeric !== null) {
    const [, day, month, year] = numeric
    if (year === undefined) {
      return nextOccurrence(today, Number(month), Number(day))
    }
    const fullYear = year.length === 2 ? 2000 + Number(year) : Number(year)
    return onDay(today, fullYear, Number(month), Number(day))
  }
  const monthDay = MONTH_DAY.exec(text) ?? DAY_MONTH.exec(text)
  if (monthDay !== null) {
    const [word, day] = /^\d/u.test(monthDay[1])
      ? [monthDay[2], monthDay[1]]
      : [monthDay[1], monthDay[2]]
    const month = named(MONTHS, word, 3)
    return month === -1 ? null : nextOccurrence(today, month + 1, Number(day))
  }
  return null
}

export function parseStartDate(
  input: string,
  now: DateTime.DateTime = DateTime.nowUnsafe()
): Date | null {
  const today = localToday(now)
  const text = input
    .trim()
    .toLowerCase()
    .replace(/^next\s+/u, "")
  const date = text === "" ? null : parse(text, today)
  return date === null || DateTime.isLessThan(date, today)
    ? null
    : DateTime.toDate(date)
}
