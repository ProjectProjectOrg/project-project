import * as DateTime from "effect/DateTime"
import * as Option from "effect/Option"
import {
  useState,
  type KeyboardEvent,
  type ReactElement,
  type ReactNode
} from "react"

import { parseDayAt, parseRangeAt } from "../lib/parseDate"
import { cn } from "../lib/utils"
import { Button } from "./button"
import { Calendar, type DateRange } from "./calendar"
import { CalendarDays } from "./icons"
import { Kbd } from "./kbd"
import { Popover, PopoverContent, PopoverTrigger } from "./popover"
import { TextSwap } from "./text-swap"

/*
 * DatePicker: a trigger and a popover holding a line you type dates into,
 * the calendar, and a tray of quick picks. Typing ("fri", "nov 20", "mon
 * for 2 weeks", "monday next week until two weeks later") previews the
 * result in the calendar and ↵ applies it; clicking a day applies it too.
 * Single days and ranges; the calendar is the same Calendar as everywhere.
 */

export type DatePickerLabels = Readonly<{
  // The trigger's text with nothing picked.
  placeholder: string
  // The type line's placeholder, with an example or two.
  type: string
  // Shown when the typed text isn't a date.
  unreadable: string
  previousMonth: string
  nextMonth: string
  // The tray's clear action; leave out to have none.
  clear?: string
}>

type QuickPick<V> = Readonly<{ label: string; value: V }>

type SharedProps = Readonly<{
  labels: DatePickerLabels
  // Days that can't be picked, e.g. { before: today }.
  disabled?: Parameters<typeof Calendar>[0]["disabled"]
  // Typed dates before today count as unreadable unless this is on.
  allowPast?: boolean
  // A line above the type line, e.g. what the date is for.
  hint?: ReactNode
  // A custom trigger (a split button, inline text). Defaults to a field.
  trigger?: ReactElement
  align?: "start" | "center" | "end"
  open?: boolean
  onOpenChange?: (open: boolean) => void
  className?: string
  // A name read before the default trigger's value, when no visible label
  // wraps it ("Date: Nov 15").
  "aria-label"?: string
}>

export type DatePickerProps = SharedProps &
  (
    | Readonly<{
        mode: "single"
        value: Date | undefined
        onChange: (value: Date | undefined) => void
        quickPicks?: ReadonlyArray<QuickPick<Date>>
        format?: (value: Date) => string
      }>
    | Readonly<{
        mode: "range"
        value: DateRange
        onChange: (value: DateRange) => void
        quickPicks?: ReadonlyArray<QuickPick<DateRange>>
        format?: (value: DateRange) => string
      }>
  )

const dayFormat = new Intl.DateTimeFormat(undefined, {
  month: "short",
  day: "numeric"
})

const formatDay = (date: Date) => dayFormat.format(date)

const formatRange = ({ from, to }: DateRange) =>
  from === undefined
    ? ""
    : to === undefined
      ? formatDay(from)
      : `${formatDay(from)} – ${formatDay(to)}`

const toDate = (day: DateTime.Zoned) => DateTime.toDateUtc(day)

type Preview =
  | Readonly<{ kind: "empty" }>
  | Readonly<{ kind: "unreadable" }>
  | Readonly<{ kind: "day"; value: Date }>
  | Readonly<{ kind: "range"; value: DateRange }>

const readTyped = (
  text: string,
  mode: "single" | "range",
  allowPast: boolean
): Preview => {
  if (text.trim() === "") return { kind: "empty" }
  const now = DateTime.nowUnsafe()
  if (mode === "single")
    return Option.match(parseDayAt(text, now, { allowPast }), {
      onNone: () => ({ kind: "unreadable" }),
      onSome: (day) => ({ kind: "day", value: toDate(day) })
    })
  return Option.match(parseRangeAt(text, now, { allowPast }), {
    onNone: () => ({ kind: "unreadable" }),
    onSome: ({ from, to }) => ({
      kind: "range",
      value: {
        from: toDate(from),
        to: Option.getOrUndefined(Option.map(to, toDate))
      }
    })
  })
}

function DatePicker(props: DatePickerProps) {
  const {
    labels,
    disabled,
    allowPast = false,
    hint,
    trigger,
    align = "start",
    className,
    "aria-label": ariaLabel
  } = props
  const [ownOpen, setOwnOpen] = useState(false)
  const open = props.open ?? ownOpen
  const setOpen = (next: boolean) => {
    if (props.open === undefined) setOwnOpen(next)
    props.onOpenChange?.(next)
  }
  const [typed, setTyped] = useState("")
  const preview = readTyped(typed, props.mode, allowPast)
  const [month, setMonth] = useState<Date | undefined>(undefined)

  const shown: Date | DateRange | undefined =
    preview.kind === "day" || preview.kind === "range"
      ? preview.value
      : props.value
  const anchor = shown instanceof Date ? shown : (shown?.from ?? undefined)
  // The calendar follows a typed date; otherwise the user's own paging.
  const visibleMonth =
    preview.kind === "day" || preview.kind === "range" ? anchor : month

  const reset = () => {
    setTyped("")
    setMonth(undefined)
  }
  const close = () => {
    reset()
    setOpen(false)
  }

  const applyTyped = () => {
    if (preview.kind === "day" && props.mode === "single") {
      props.onChange(preview.value)
      close()
    }
    if (preview.kind === "range" && props.mode === "range") {
      props.onChange(preview.value)
      if (preview.value.to !== undefined) close()
      else setTyped("")
    }
  }

  const onTypeKey = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key !== "Enter") return
    event.preventDefault()
    applyTyped()
  }

  const triggerText =
    props.mode === "single"
      ? props.value === undefined
        ? null
        : (props.format ?? formatDay)(props.value)
      : props.value.from === undefined
        ? null
        : (props.format ?? formatRange)(props.value)

  const result =
    preview.kind === "unreadable" ? (
      <span className="truncate text-caption text-muted-foreground">
        {labels.unreadable}
      </span>
    ) : preview.kind === "day" || preview.kind === "range" ? (
      <span className="flex shrink-0 items-center gap-1.5 text-caption text-muted-foreground tabular-nums">
        <TextSwap speed="fast">
          {preview.kind === "day"
            ? formatDay(preview.value)
            : formatRange(preview.value)}
        </TextSwap>
        <Kbd size="sm" aria-hidden>
          ↵
        </Kbd>
      </span>
    ) : null

  return (
    <Popover
      open={open}
      onOpenChange={(next) => {
        if (!next) reset()
        setOpen(next)
      }}
    >
      <PopoverTrigger
        render={
          trigger ?? (
            <Button
              type="button"
              variant="field"
              leadingIcon={CalendarDays}
              className={cn("min-w-48 justify-start", className)}
            />
          )
        }
      >
        {trigger === undefined ? (
          <>
            {ariaLabel !== undefined && (
              <span className="sr-only">{ariaLabel}: </span>
            )}
            {triggerText === null ? (
              <span className="text-muted-foreground">
                {labels.placeholder}
              </span>
            ) : (
              <TextSwap>{triggerText}</TextSwap>
            )}
          </>
        ) : undefined}
      </PopoverTrigger>
      <PopoverContent
        align={align}
        initialFocus={false}
        className="w-auto overflow-hidden p-0"
      >
        {/* The type line and hint take the calendar's width (w-0
            min-w-full), so a long placeholder doesn't widen the popover. */}
        {hint !== undefined && (
          <p className="w-0 min-w-full px-4 pt-3 text-caption text-muted-foreground">
            {hint}
          </p>
        )}
        <label className="flex h-11 w-0 min-w-full items-center gap-2 border-b border-border/60 px-4">
          <span className="sr-only">{labels.type}</span>
          <input
            // oxlint-disable-next-line jsx-a11y/no-autofocus -- the picker opens to type into
            autoFocus
            value={typed}
            onChange={(event) => setTyped(event.target.value)}
            onKeyDown={onTypeKey}
            placeholder={labels.type}
            aria-invalid={preview.kind === "unreadable" || undefined}
            className="h-full min-w-0 flex-1 bg-transparent text-body outline-hidden placeholder:text-muted-foreground"
          />
          {result}
        </label>
        {props.mode === "single" ? (
          <Calendar
            mode="single"
            autoFocus={false}
            navLabels={{
              previous: labels.previousMonth,
              next: labels.nextMonth
            }}
            selected={shown instanceof Date ? shown : undefined}
            onSelect={(date) => {
              props.onChange(date)
              if (date !== undefined) close()
            }}
            disabled={disabled}
            month={visibleMonth}
            onMonthChange={setMonth}
            defaultMonth={anchor}
          />
        ) : (
          <Calendar
            mode="range"
            autoFocus={false}
            navLabels={{
              previous: labels.previousMonth,
              next: labels.nextMonth
            }}
            selected={shown instanceof Date ? undefined : shown}
            onSelect={(range) => {
              setTyped("")
              props.onChange(range ?? { from: undefined, to: undefined })
            }}
            disabled={disabled}
            month={visibleMonth}
            onMonthChange={setMonth}
            defaultMonth={anchor}
            numberOfMonths={2}
          />
        )}
        <Tray
          picks={
            props.mode === "single"
              ? (props.quickPicks ?? []).map((pick) => ({
                  label: pick.label,
                  apply: () => props.onChange(pick.value)
                }))
              : (props.quickPicks ?? []).map((pick) => ({
                  label: pick.label,
                  apply: () => props.onChange(pick.value)
                }))
          }
          clear={
            labels.clear === undefined
              ? undefined
              : {
                  label: labels.clear,
                  apply: () =>
                    props.mode === "single"
                      ? props.onChange(undefined)
                      : props.onChange({ from: undefined, to: undefined })
                }
          }
          onDone={close}
        />
      </PopoverContent>
    </Popover>
  )
}

type TrayAction = Readonly<{ label: string; apply: () => void }>

// Quick picks at the start, Clear at the end, on the composer's tray tint.
function Tray({
  picks,
  clear,
  onDone
}: Readonly<{
  picks: ReadonlyArray<TrayAction>
  clear: TrayAction | undefined
  onDone: () => void
}>) {
  if (picks.length === 0 && clear === undefined) return null
  const button = (action: TrayAction, end = false) => (
    <Button
      key={action.label}
      type="button"
      variant="ghost"
      size="sm"
      className={cn("px-2.5", end && "ml-auto")}
      onClick={() => {
        action.apply()
        onDone()
      }}
    >
      {action.label}
    </Button>
  )
  return (
    <div className="flex items-center gap-1 bg-(--composer-tray) p-1.5">
      {picks.map((pick) => button(pick))}
      {clear !== undefined && button(clear, true)}
    </div>
  )
}

export { DatePicker }
export type { DateRange }
