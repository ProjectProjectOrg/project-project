import * as DateTime from "effect/DateTime"
import * as Option from "effect/Option"
import {
  useEffect,
  useRef,
  useState,
  type KeyboardEvent,
  type ReactElement,
  type ReactNode
} from "react"

import { parseDayAt, parseRangeAt } from "../lib/parseDate"
import { cn } from "../lib/utils"
import { Button, buttonVariants } from "./button"
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
const dayYearFormat = new Intl.DateTimeFormat(undefined, {
  month: "short",
  day: "numeric",
  year: "numeric"
})

// "Nov 20" this year, "Nov 20, 2027" any other, so a typed year shows.
const formatDay = (date: Date) =>
  (date.getFullYear() === DateTime.getPart(DateTime.nowUnsafe(), "year")
    ? dayFormat
    : dayYearFormat
  ).format(date)

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

  const result = (
    <TypedResult preview={preview} unreadable={labels.unreadable} />
  )

  // Typing straight into the focused trigger: it becomes a text field in
  // place (InlineField), and Enter or leaving it applies what it reads.
  const [typingFrom, setTypingFrom] = useState<string | null>(null)
  // The field starts at the trigger's width and grows with the text.
  const [typingWidth, setTypingWidth] = useState<number | undefined>(undefined)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const refocus = useRef(false)
  useEffect(() => {
    if (typingFrom !== null || !refocus.current) return
    refocus.current = false
    triggerRef.current?.focus()
  }, [typingFrom])

  const applyPreview = (next: Preview): boolean => {
    if (next.kind === "day" && props.mode === "single") {
      props.onChange(next.value)
      return true
    }
    if (next.kind === "range" && props.mode === "range") {
      props.onChange(next.value)
      return true
    }
    return false
  }

  const startTyping = (event: KeyboardEvent<HTMLButtonElement>) => {
    const printable =
      event.key.length === 1 &&
      event.key !== " " &&
      !event.metaKey &&
      !event.ctrlKey &&
      !event.altKey
    if (!printable || open) return
    event.preventDefault()
    setTypingWidth(event.currentTarget.offsetWidth)
    setTypingFrom(event.key)
  }

  if (trigger === undefined && typingFrom !== null)
    return (
      <InlineField
        initial={typingFrom}
        width={typingWidth}
        mode={props.mode}
        allowPast={allowPast}
        labels={labels}
        className={className}
        apply={applyPreview}
        onEnd={(back) => {
          refocus.current = back
          setTypingFrom(null)
        }}
      />
    )

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
              ref={triggerRef}
              type="button"
              variant="field"
              leadingIcon={CalendarDays}
              onKeyDown={startTyping}
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

// Clips its child and fades the cut edge, only while it's actually cut.
function ClipFade({ children }: Readonly<{ children: ReactNode }>) {
  const ref = useRef<HTMLSpanElement>(null)
  const [clipped, setClipped] = useState(false)
  useEffect(() => {
    const el = ref.current
    if (el === null || typeof ResizeObserver === "undefined") return undefined
    const check = () => setClipped(el.scrollWidth > el.clientWidth + 1)
    const observer = new ResizeObserver(check)
    observer.observe(el)
    if (el.firstElementChild !== null) observer.observe(el.firstElementChild)
    check()
    return () => observer.disconnect()
  }, [])
  return (
    <span
      ref={ref}
      className="flex min-w-0 overflow-hidden"
      style={
        clipped
          ? {
              maskImage:
                "linear-gradient(to right, #000 calc(100% - 20px), transparent)"
            }
          : undefined
      }
    >
      {children}
    </span>
  )
}

function TypedResult({
  preview,
  unreadable,
  fit = false
}: Readonly<{
  preview: Preview
  unreadable: string
  // In a tight field: the value still rolls through TextSwap, at its own
  // width, and gives way before anything else, fading out at the clip edge
  // (Scritto draws in a shadow root, which an ellipsis can't cut); the ↵
  // key never shrinks.
  fit?: boolean
}>) {
  if (preview.kind === "unreadable")
    return (
      <span
        className={cn(
          "truncate text-caption text-muted-foreground",
          fit && "ml-auto min-w-0 shrink-[100]"
        )}
      >
        {unreadable}
      </span>
    )
  if (preview.kind === "empty") return null
  const text =
    preview.kind === "day"
      ? formatDay(preview.value)
      : formatRange(preview.value)
  if (fit)
    return (
      <span className="ml-auto flex shrink-[100] items-center gap-1.5 text-caption text-muted-foreground tabular-nums">
        <ClipFade>
          <TextSwap speed="fast" className="max-w-none shrink-0">
            {text}
          </TextSwap>
        </ClipFade>
        <Kbd size="sm" aria-hidden>
          ↵
        </Kbd>
      </span>
    )
  return (
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
  )
}

// The trigger as a text field, after typing into it: the same field look,
// the typed text, and what it reads as. Enter or leaving applies a readable
// value (`apply`); Escape cancels; `onEnd(true)` hands focus back.
function InlineField({
  initial,
  width,
  mode,
  allowPast,
  labels,
  className,
  apply,
  onEnd
}: Readonly<{
  initial: string
  width: number | undefined
  mode: "single" | "range"
  allowPast: boolean
  labels: DatePickerLabels
  className: string | undefined
  apply: (preview: Preview) => boolean
  onEnd: (refocus: boolean) => void
}>) {
  const [text, setText] = useState(initial)
  const preview = readTyped(text, mode, allowPast)
  return (
    <span
      data-slot="date-picker-inline"
      className={cn(
        buttonVariants({ variant: "field", size: "md", iconLeft: true }),
        // Button sets its corners outside the variants: the md field's.
        "max-w-full min-w-48 cursor-text justify-start rounded-[16px] [corner-shape:var(--button-corner)] focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-ring",
        // A field doesn't press; the ↵ key sits 8px in, like a key in a button.
        "has-[[data-slot=kbd]]:pr-2 motion-safe:active:scale-100",
        className
      )}
      style={{ minWidth: width }}
    >
      <CalendarDays aria-hidden className="size-4 shrink-0" />
      <input
        // oxlint-disable-next-line jsx-a11y/no-autofocus -- typing into the trigger turned it into this field
        autoFocus
        value={text}
        aria-label={labels.type}
        aria-invalid={preview.kind === "unreadable" || undefined}
        onChange={(event) => setText(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === "Escape") {
            event.preventDefault()
            onEnd(true)
          }
          if (event.key !== "Enter") return
          event.preventDefault()
          if (apply(preview) || text.trim() === "") onEnd(true)
        }}
        onBlur={() => {
          apply(preview)
          onEnd(false)
        }}
        // Grows with what's typed; the preview gives way first.
        className="[field-sizing:content] h-full min-w-[3ch] shrink bg-transparent text-body outline-hidden"
      />
      <TypedResult preview={preview} unreadable={labels.unreadable} fit />
    </span>
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
