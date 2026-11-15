import * as chrono from "chrono-node"
import * as DateTime from "effect/DateTime"
import * as Effect from "effect/Effect"
import * as Option from "effect/Option"

// Typed dates, read by chrono-node: "today", "fri", "next week", "in 3
// days", "nov 20", "20/11", and ranges such as "mon - fri", "nov 16 to nov
// 27" or "monday next week until two weeks later". On top of chrono:
// - every result is a whole local day (a DateTime.Zoned at midnight);
// - a range's end is read from its start, so "until two weeks later" means
//   two weeks after the start, not after today;
// - "<start> for <n> days|weeks" sets the length from the start.
// Used by DatePicker's type line and ⌘K's sprint scheduling.
//
// `parseDay` and `parseRange` read today from the Clock; the `…At` variants
// take it, for render paths and tests.

export const WEEKDAYS = [
  "sunday",
  "monday",
  "tuesday",
  "wednesday",
  "thursday",
  "friday",
  "saturday"
] as const

export const localToday = (now: DateTime.DateTime): DateTime.Zoned =>
  DateTime.startOf(DateTime.setZone(now, DateTime.zoneMakeLocal()), "day")

const dayOf = (date: Date): DateTime.Zoned =>
  localToday(DateTime.makeUnsafe(date))

export type ParseOptions = Readonly<{
  // Days before today read as nothing unless this is on. Off, a bare
  // weekday ("fri") means the coming one.
  allowPast?: boolean
}>

export type DayRange = Readonly<{
  from: DateTime.Zoned
  // None: a start without an end ("fri").
  to: Option.Option<DateTime.Zoned>
}>

const read = (text: string, reference: DateTime.Zoned, allowPast: boolean) =>
  chrono.parse(text, DateTime.toDateUtc(reference), {
    forwardDate: !allowPast
  })

const notBefore =
  (today: DateTime.Zoned, allowPast: boolean) =>
  (day: DateTime.Zoned): boolean =>
    allowPast || !DateTime.isLessThan(day, today)

export const parseDayAt = (
  input: string,
  now: DateTime.DateTime,
  { allowPast = false }: ParseOptions = {}
): Option.Option<DateTime.Zoned> => {
  const today = localToday(now)
  return Option.fromNullishOr(read(input.trim(), today, allowPast)[0]).pipe(
    Option.map((result) => dayOf(result.start.date())),
    Option.filter(notBefore(today, allowPast))
  )
}

// Splits "<start> <connector> <end>" so the end can be read from the start.
const CONNECTOR = /\s+(?:until|till|through|to|-|–)\s+/iu
const FOR_LENGTH = /^for\s+/iu
const DAY_MS = 86_400_000

const daysBetween = (from: DateTime.Zoned, to: DateTime.Zoned): number =>
  Math.round(
    (DateTime.toEpochMillis(to) - DateTime.toEpochMillis(from)) / DAY_MS
  )

export const parseRangeAt = (
  input: string,
  now: DateTime.DateTime,
  { allowPast = false }: ParseOptions = {}
): Option.Option<DayRange> => {
  const today = localToday(now)
  const text = input.trim()
  const [first, second] = read(text, today, allowPast)
  if (first === undefined) return Option.none()
  const from = dayOf(first.start.date())
  if (!notBefore(today, allowPast)(from)) return Option.none()

  const chronoEnd = first.end
  if (chronoEnd !== undefined && chronoEnd !== null) {
    const parts = first.text.split(CONNECTOR)
    const endText = parts.length > 1 ? parts.slice(1).join(" ") : ""
    const end = Option.fromNullishOr(read(endText, from, true)[0]).pipe(
      Option.map((result) => dayOf(result.start.date())),
      Option.orElse(() => Option.some(dayOf(chronoEnd.date())))
    )
    return end.pipe(
      Option.filter((to) => !DateTime.isLessThan(to, from)),
      Option.map((to) => ({ from, to: Option.some(to) }))
    )
  }

  // "for 2 weeks": chrono reads the length as a date that far from today;
  // apply the same length to the start instead.
  if (second !== undefined && FOR_LENGTH.test(second.text)) {
    const length = daysBetween(today, dayOf(second.start.date()))
    return length < 1
      ? Option.none()
      : Option.some({
          from,
          to: Option.some(DateTime.add(from, { days: length - 1 }))
        })
  }
  return Option.some({ from, to: Option.none() })
}

export const parseDay = (
  input: string,
  options?: ParseOptions
): Effect.Effect<Option.Option<DateTime.Zoned>> =>
  Effect.map(DateTime.now, (now) => parseDayAt(input, now, options))

export const parseRange = (
  input: string,
  options?: ParseOptions
): Effect.Effect<Option.Option<DayRange>> =>
  Effect.map(DateTime.now, (now) => parseRangeAt(input, now, options))
