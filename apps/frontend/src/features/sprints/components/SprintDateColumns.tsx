import { cn } from "@/lib/utils"
import { getLocale } from "@/paraglide/runtime"

const FIGURE_SPACE = " "

const format = (date: Date, options: Intl.DateTimeFormatOptions) =>
  new Intl.DateTimeFormat(getLocale(), options).format(date)

const monthDay = (date: Date) =>
  `${format(date, { month: "short" })} ${format(date, { day: "numeric" }).padStart(2, FIGURE_SPACE)}`

export function DateColumns({
  weekday,
  start,
  end
}: Readonly<{ weekday: Date | null; start: Date; end?: Date }>) {
  return (
    <span
      className={cn(
        "inline-grid items-baseline text-left whitespace-pre tabular-nums",
        end === undefined
          ? "grid-cols-[2rem_auto]"
          : "grid-cols-[2rem_auto_1.5rem_auto]"
      )}
    >
      <span>
        {weekday === null ? null : format(weekday, { weekday: "short" })}
      </span>
      <span>{monthDay(start)}</span>
      {end === undefined ? null : (
        <>
          <span className="text-center">→</span>
          <span>{monthDay(end)}</span>
        </>
      )}
    </span>
  )
}
