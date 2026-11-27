const MINUTE = 60_000
const HOUR = 60 * MINUTE
const DAY = 24 * HOUR

const unit = (locale: string, name: "minute" | "hour" | "day", value: number) =>
  new Intl.NumberFormat(locale, {
    style: "unit",
    unit: name,
    unitDisplay: "narrow"
  }).format(value)

export const compactAge = (
  date: Date,
  now: number,
  locale: string,
  justNow: string
) => {
  const age = Math.max(now - date.getTime(), 0)
  if (age < MINUTE) return justNow
  if (age < HOUR) return unit(locale, "minute", Math.floor(age / MINUTE))
  if (age < DAY) return unit(locale, "hour", Math.floor(age / HOUR))
  if (age < 7 * DAY) return unit(locale, "day", Math.floor(age / DAY))
  return new Intl.DateTimeFormat(locale, {
    month: "short",
    day: "numeric"
  }).format(date)
}
