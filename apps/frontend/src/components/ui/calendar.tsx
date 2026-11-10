import {
  DayPicker,
  rangeContainsModifiers,
  useDayPicker,
  type CalendarMonth,
  type CustomComponents,
  type DateRange,
  type DayButtonProps,
  type DayPickerProps,
  type DayProps,
  type Matcher,
  type MonthCaptionProps,
  type MonthProps,
  type RootProps,
  type WeekProps
} from "@daypicker/react"
import { ChevronRight } from "lucide-react"
import {
  AnimatePresence,
  animate,
  motion,
  useIsPresent,
  useMotionValue,
  useReducedMotion
} from "motion/react"
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type FocusEvent,
  type HTMLAttributes,
  type KeyboardEvent,
  type MouseEvent,
  type ReactNode,
  type RefObject
} from "react"

import { Button } from "@/components/ui/button"
import { FluidHoverHighlight } from "@/components/ui/fluid-hover-highlight"
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger
} from "@/components/ui/tooltip"
import {
  useFluidHover,
  useRegisterFluidHoverItem,
  type ItemRect,
  type UseFluidHoverReturn
} from "@/hooks/useFluidHover"
import { useKeyboardNavGate } from "@/hooks/useKeyboardNavGate"
import { fontWeights } from "@/lib/fontWeight"
import { exitFallbackMs, spring } from "@/lib/springs"
import { cn } from "@/lib/utils"
import { m } from "@/paraglide/messages"

function dayNumber(date: Date) {
  return Math.round(
    Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()) / 86_400_000
  )
}

function addDays(date: Date, days: number) {
  // @effect-diagnostics-next-line globalDate:off
  return new Date(date.getFullYear(), date.getMonth(), date.getDate() + days)
}

const flatMatchers = (matchers: DayPickerProps["disabled"]): Matcher[] =>
  matchers === undefined
    ? []
    : Array.isArray(matchers)
      ? matchers
      : [matchers]

type Band = Readonly<{ from: number; to: number }>

type CalendarContextValue = Readonly<{
  range: DateRange | undefined
  picking: boolean
  isEnd: (day: number) => boolean
  disabledMatchers: Matcher[]
}>

const CalendarContext = createContext<CalendarContextValue | null>(null)

function useCalendarContext() {
  const ctx = useContext(CalendarContext)
  if (!ctx) throw new Error("Calendar parts must be inside <Calendar>")
  return ctx
}

type GridContextValue = Readonly<{
  registerItem: UseFluidHoverReturn["registerItem"]
  gridStart: number
  band: Band | null
  previewEnd: number | null
  direction: number
  reduceMotion: boolean
  stride: number | null
  committedEnd: number | null
  ghost: Readonly<{ from: number; to: number; id: number }> | null
}>

const GridContext = createContext<GridContextValue | null>(null)

function useGridContext() {
  const ctx = useContext(GridContext)
  if (!ctx) throw new Error("Calendar parts must be inside <Calendar>")
  return ctx
}

const MonthContext = createContext<CalendarMonth | null>(null)

const PanelPresentContext = createContext(true)

const useIsoLayoutEffect =
  typeof window !== "undefined" ? useLayoutEffect : useEffect

const INDEX_ATTR = "data-calendar-index"
const INERT_ATTR = "data-calendar-inert"
const MONTH_GAP = 24
const MONTH_TRAVEL = 1 / 3

function slideVariants(offset: number, stride: number | null) {
  const carousel = stride !== null && offset > 0
  const distance = carousel ? stride * MONTH_TRAVEL : offset
  const exitTransition = carousel ? spring.moderate : spring.moderate.exit
  return {
    enter: (d: number) => ({ opacity: 0, x: d * distance }),
    center: { opacity: 1, x: 0, transition: spring.moderate },
    exit: (d: number) => ({
      opacity: 0,
      x: -d * distance,
      transition: exitTransition
    })
  }
}

const stripMaskImage =
  "linear-gradient(to right, transparent, #000 8px, #000 calc(100% - 8px), transparent)"
const stripMask: CSSProperties = {
  maskImage: stripMaskImage,
  WebkitMaskImage: stripMaskImage
}

const isDisabledDay = (el: HTMLElement) =>
  (el instanceof HTMLButtonElement && el.disabled) ||
  el.getAttribute("aria-disabled") === "true"

function useMonthDirection(monthKey: number, isMeasured: boolean) {
  const [lastMonthKey, setLastMonthKey] = useState(monthKey)
  const [direction, setDirection] = useState(0)
  const [snap, setSnap] = useState(false)
  if (monthKey !== lastMonthKey) {
    setLastMonthKey(monthKey)
    setDirection(monthKey > lastMonthKey ? 1 : -1)
    setSnap(true)
  }
  useEffect(() => {
    if (!snap || !isMeasured) return undefined
    const id = requestAnimationFrame(() => setSnap(false))
    return () => cancelAnimationFrame(id)
  }, [snap, isMeasured])
  return { direction, snap, setSnap }
}

function useMonthStride(containerRef: RefObject<HTMLDivElement | null>) {
  const [stride, setStride] = useState<number | null>(null)
  useIsoLayoutEffect(() => {
    const month = containerRef.current?.querySelector<HTMLElement>(
      '[data-slot="calendar-month"]'
    )
    if (!month) return undefined
    const measure = () => setStride(month.offsetWidth + MONTH_GAP)
    measure()
    if (typeof ResizeObserver === "undefined") return undefined
    const ro = new ResizeObserver(measure)
    ro.observe(month)
    return () => ro.disconnect()
  }, [containerRef])
  return stride
}

function useClearAfterExit(
  value: GridContextValue["ghost"] | number,
  clear: () => void
) {
  useEffect(() => {
    if (value === null) return undefined
    const id = window.setTimeout(clear, exitFallbackMs(spring.moderate))
    return () => window.clearTimeout(id)
  }, [value, clear])
}

const noPreview = { band: null, previewEnd: null }

function previewBand(cal: CalendarContextValue, previewDate: Date | null) {
  const from = cal.range?.from
  if (!from) return noPreview
  const start = dayNumber(from)
  if (!cal.picking) {
    const to = cal.range?.to
    return {
      band: to ? { from: start, to: dayNumber(to) } : null,
      previewEnd: null
    }
  }
  if (!previewDate) return noPreview
  const span =
    from < previewDate
      ? { from, to: previewDate }
      : { from: previewDate, to: from }
  if (
    cal.disabledMatchers.length > 0 &&
    rangeContainsModifiers(span, cal.disabledMatchers)
  )
    return noPreview
  const end = dayNumber(previewDate)
  return {
    band: { from: Math.min(start, end), to: Math.max(start, end) },
    previewEnd: end
  }
}

function useRangePreview(
  firstDay: Date | undefined,
  activeIndex: number | null
) {
  const cal = useCalendarContext()
  const { picking } = cal
  const from = cal.range?.from
  const to = cal.range?.to
  const previewDate =
    picking && activeIndex !== null && firstDay
      ? addDays(firstDay, activeIndex)
      : null
  const preview = previewBand(cal, previewDate)
  const { previewEnd } = preview
  const bandFrom = preview.band?.from ?? null
  const bandTo = preview.band?.to ?? null
  const band = useMemo(
    () =>
      bandFrom === null || bandTo === null
        ? null
        : { from: bandFrom, to: bandTo },
    [bandFrom, bandTo]
  )

  const [pickTrack, setPickTrack] = useState({ picking, end: previewEnd })
  const [committedEnd, setCommittedEnd] = useState<number | null>(null)
  if (
    pickTrack.picking !== picking ||
    (picking && pickTrack.end !== previewEnd)
  ) {
    if (
      pickTrack.picking &&
      !picking &&
      pickTrack.end !== null &&
      from &&
      to
    ) {
      const ends = [dayNumber(from), dayNumber(to)]
      if (ends.includes(pickTrack.end)) setCommittedEnd(pickTrack.end)
    }
    setPickTrack({ picking, end: picking ? previewEnd : null })
  }

  const committed =
    !picking && from && to ? { from: dayNumber(from), to: dayNumber(to) }
      : null
  const [lastCommitted, setLastCommitted] = useState(committed)
  const [ghost, setGhost] = useState<GridContextValue["ghost"]>(null)
  if (
    committed?.from !== lastCommitted?.from ||
    committed?.to !== lastCommitted?.to
  ) {
    if (lastCommitted && !committed)
      setGhost({ ...lastCommitted, id: (ghost?.id ?? 0) + 1 })
    setLastCommitted(committed)
  }

  const clearGhost = useCallback(() => setGhost(null), [])
  const clearCommittedEnd = useCallback(() => setCommittedEnd(null), [])
  useClearAfterExit(ghost, clearGhost)
  useClearAfterExit(committedEnd, clearCommittedEnd)

  const previewGlides =
    previewEnd !== null && !!from && previewEnd !== dayNumber(from)
  return { band, previewEnd, previewGlides, committedEnd, ghost }
}

function useFocusRing(setActiveIndex: (index: number | null) => void) {
  const { keyboardNavRef, trackKeyboardNav } = useKeyboardNavGate()
  const autoFocusPendingRef = useRef(true)
  const [focusedIndex, setFocusedIndex] = useState<number | null>(null)

  const onFocus = (e: FocusEvent) => {
    const el = e.target.closest(`[${INDEX_ATTR}]`)
    if (!el) return
    const idx = Number(el.getAttribute(INDEX_ATTR))
    setActiveIndex(idx)
    const fromScript = autoFocusPendingRef.current
    autoFocusPendingRef.current = false
    const ring =
      keyboardNavRef.current ||
      (!fromScript && e.target.matches(":focus-visible"))
    setFocusedIndex(ring ? idx : null)
  }

  const onBlur = (e: FocusEvent) => {
    if (e.currentTarget.contains(e.relatedTarget)) return
    setFocusedIndex(null)
    setActiveIndex(null)
  }

  const onMouseDown = () => {
    keyboardNavRef.current = false
    setFocusedIndex(null)
  }

  return {
    focusedIndex,
    clearFocusedIndex: () => setFocusedIndex(null),
    trackKeyboardNav,
    onFocus,
    onBlur,
    onMouseDown
  }
}

function usePressed() {
  const [pressed, setPressed] = useState(false)
  useEffect(() => {
    if (!pressed) return undefined
    const release = () => setPressed(false)
    window.addEventListener("mouseup", release)
    return () => window.removeEventListener("mouseup", release)
  }, [pressed])
  return [pressed, setPressed] as const
}

function Months({
  className,
  children,
  ...props
}: HTMLAttributes<HTMLDivElement>) {
  const cal = useCalendarContext()
  const { months } = useDayPicker()
  const containerRef = useRef<HTMLDivElement>(null)
  const reduceMotion = useReducedMotion() ?? false

  const hover = useFluidHover(containerRef, {
    axis: "xy",
    isItemDisabled: isDisabledDay
  })
  const {
    activeIndex,
    setActiveIndex,
    itemRects,
    isMeasured,
    handlers,
    registerItem
  } = hover
  const { onMouseMove, onMouseEnter, onMouseLeave, onClick } = handlers

  const firstDay = months[0]?.weeks[0]?.days[0]?.date
  const gridStart = firstDay ? dayNumber(firstDay) : 0
  const { direction, snap, setSnap } = useMonthDirection(
    months[0]?.date.getTime() ?? 0,
    isMeasured
  )
  const stride = useMonthStride(containerRef)
  const { band, previewEnd, previewGlides, committedEnd, ghost } =
    useRangePreview(firstDay, activeIndex)
  const focus = useFocusRing(setActiveIndex)
  const [pressed, setPressed] = usePressed()
  const inertRef = useRef(false)

  const handleMouseMove = (e: MouseEvent) => {
    if (focus.focusedIndex !== null) focus.clearFocusedIndex()
    if (snap) setSnap(false)
    if (e.target instanceof Element && e.target.closest(`[${INERT_ATTR}]`)) {
      if (!inertRef.current) {
        inertRef.current = true
        onMouseLeave()
      }
      return
    }
    if (inertRef.current) {
      inertRef.current = false
      onMouseEnter()
    }
    onMouseMove(e)
  }

  const litDay = activeIndex !== null ? gridStart + activeIndex : null
  const litFilled = litDay !== null && cal.isEnd(litDay)

  const gridCtx = useMemo(
    () => ({
      registerItem,
      gridStart,
      band,
      previewEnd,
      direction,
      reduceMotion,
      stride,
      committedEnd,
      ghost
    }),
    [
      registerItem,
      gridStart,
      band,
      previewEnd,
      direction,
      reduceMotion,
      stride,
      committedEnd,
      ghost
    ]
  )

  const focusRect: ItemRect | null =
    isMeasured && focus.focusedIndex !== null
      ? (itemRects[focus.focusedIndex] ?? null)
      : null

  return (
    <div
      ref={containerRef}
      data-slot="calendar-months"
      role="presentation"
      className={cn(
        "relative isolate flex flex-row flex-wrap gap-x-6 gap-y-4",
        className
      )}
      onKeyDownCapture={focus.trackKeyboardNav}
      onMouseDown={(e) => {
        focus.onMouseDown()
        if (e.button === 0) setPressed(true)
      }}
      onMouseUp={() => setPressed(false)}
      onMouseEnter={() => {
        inertRef.current = false
        onMouseEnter()
      }}
      onMouseMove={handleMouseMove}
      onMouseLeave={onMouseLeave}
      onClick={onClick}
      onFocus={focus.onFocus}
      onBlur={focus.onBlur}
      {...props}
    >
      <GridContext.Provider value={gridCtx}>
        <div className="-mx-2 -my-2 flex flex-row gap-x-6 p-2" style={stripMask}>
          <FluidHoverHighlight
            hover={hover}
            className={cn(
              "z-[1] rounded-lg",
              previewGlides
                ? "bg-foreground"
                : cn(
                    "bg-transparent before:pointer-events-none before:absolute before:inset-px before:rounded-[inherit] before:bg-[var(--day-press)] before:transition-[box-shadow,background-color] before:[transition-duration:180ms,80ms] before:[transition-timing-function:cubic-bezier(0.23,1,0.32,1),ease]",
                    pressed && !litFilled
                      ? "[--day-press:var(--active)] before:shadow-[0_0_0_0px_var(--day-press)] before:[transition-duration:80ms,80ms]"
                      : "[--day-press:var(--hover)] before:shadow-[0_0_0_1px_var(--day-press)]"
                  )
            )}
            instant={snap}
          />
          <AnimatePresence>
            {focusRect && (
              <motion.div
                data-slot="calendar-focus-ring"
                className="pointer-events-none absolute top-0 left-0 z-[3] rounded-[10px] border border-ring"
                initial={{
                  opacity: 0,
                  x: focusRect.left - 2,
                  y: focusRect.top - 2,
                  width: focusRect.width + 4,
                  height: focusRect.height + 4
                }}
                animate={{
                  opacity: 1,
                  x: focusRect.left - 2,
                  y: focusRect.top - 2,
                  width: focusRect.width + 4,
                  height: focusRect.height + 4
                }}
                exit={{ opacity: 0, transition: spring.fast.exit }}
                transition={{
                  ...(snap || reduceMotion ? { duration: 0 } : spring.fast),
                  opacity: { duration: 0.08 }
                }}
              />
            )}
          </AnimatePresence>
          {children}
        </div>
      </GridContext.Provider>
    </div>
  )
}

function Month({
  calendarMonth,
  displayIndex: _displayIndex,
  className,
  children,
  ...props
}: MonthProps) {
  return (
    <MonthContext.Provider value={calendarMonth}>
      <div
        data-slot="calendar-month"
        className={cn("flex flex-col", className)}
        {...props}
      >
        {children}
      </div>
    </MonthContext.Provider>
  )
}

const NAV_DIRECTIONS = ["previous", "next"] as const

type NavDirection = (typeof NAV_DIRECTIONS)[number]

function NavButton({ direction }: Readonly<{ direction: NavDirection }>) {
  const { previousMonth, nextMonth, goToMonth, labels } = useDayPicker()
  const previous = direction === "previous"
  const target = previous ? previousMonth : nextMonth
  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            aria-label={
              previous
                ? labels.labelPrevious(previousMonth)
                : labels.labelNext(nextMonth)
            }
            aria-disabled={target ? undefined : true}
            data-calendar-nav={direction}
            disabled={!target}
            onClick={() => {
              if (target) goToMonth(target)
            }}
            className="relative z-[1] !size-[var(--cell-size)] hover:bg-transparent"
          >
            <ChevronRight size={16} className={cn(previous && "rotate-180")} />
          </Button>
        }
      />
      <TooltipContent>
        {previous ? m.common_previous_month() : m.common_next_month()}
      </TooltipContent>
    </Tooltip>
  )
}

function NavGroup() {
  const ref = useRef<HTMLDivElement>(null)
  const hover = useFluidHover(ref, { axis: "x", isItemDisabled: isDisabledDay })
  const { setActiveIndex } = hover
  return (
    <div
      ref={ref}
      data-slot="calendar-nav"
      className="relative flex items-center"
      {...hover.handlers}
      onFocus={(e) => {
        const nav = e.target.getAttribute("data-calendar-nav")
        const idx = NAV_DIRECTIONS.findIndex((d) => d === nav)
        if (idx >= 0 && e.target.matches(":focus-visible")) setActiveIndex(idx)
      }}
      onBlur={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget)) setActiveIndex(null)
      }}
    >
      <FluidHoverHighlight hover={hover} className="z-0 rounded-lg" />
      {NAV_DIRECTIONS.map((direction, i) => (
        <NavSlot key={direction} index={i} registerItem={hover.registerItem}>
          <NavButton direction={direction} />
        </NavSlot>
      ))}
    </div>
  )
}

function NavSlot({
  index,
  registerItem,
  children
}: Readonly<{
  index: number
  registerItem: UseFluidHoverReturn["registerItem"]
  children: ReactNode
}>) {
  const ref = useRef<HTMLSpanElement>(null)
  useRegisterFluidHoverItem(registerItem, index, ref)
  return (
    <span className="flex w-[var(--cell-size)] justify-center">
      <span ref={ref} className="relative flex">
        {children}
      </span>
    </span>
  )
}

function CaptionText({
  offset,
  stride,
  children
}: Readonly<{
  offset: number
  stride: number | null
  children: ReactNode
}>) {
  const present = useIsPresent()
  const { direction } = useGridContext()
  return (
    <motion.span
      role={present ? "status" : undefined}
      aria-live={present ? "polite" : undefined}
      aria-hidden={present ? undefined : true}
      className="col-start-1 row-start-1 justify-self-start text-body whitespace-nowrap text-foreground [text-box:trim-both_cap_alphabetic]"
      style={{ fontVariationSettings: fontWeights.semibold }}
      variants={slideVariants(offset, stride)}
      custom={direction}
      initial="enter"
      animate="center"
      exit="exit"
    >
      {children}
    </motion.span>
  )
}

function captionFade(stride: number) {
  const clear = `calc(${stride}px + var(--cell-size) * 2)`
  return `linear-gradient(to left, transparent ${clear}, #000 calc(${clear} + 24px))`
}

function MonthCaption({
  calendarMonth,
  displayIndex: _displayIndex,
  className,
  children: _children,
  ...props
}: MonthCaptionProps) {
  const { formatters } = useDayPicker()
  const { direction, reduceMotion, stride } = useGridContext()
  const key = calendarMonth.date.getTime()
  const firstDay = calendarMonth.weeks[0]?.days[0]
  const caption = (
    <span className="relative inline-grid">
      <AnimatePresence initial={false} custom={direction}>
        <CaptionText key={key} offset={reduceMotion ? 0 : 10} stride={stride}>
          {formatters.formatCaption(
            calendarMonth.date,
            firstDay?.dateLib.options,
            firstDay?.dateLib
          )}
        </CaptionText>
      </AnimatePresence>
    </span>
  )

  return (
    <div
      data-slot="calendar-caption"
      {...{ [INERT_ATTR]: "" }}
      className={cn(
        "relative mb-1 flex h-[var(--cell-size)] items-center justify-between gap-1 pl-2",
        className
      )}
      {...props}
    >
      {stride === null ? (
        caption
      ) : (
        <>
          <div
            className="pointer-events-none absolute inset-y-0"
            style={{
              left: -stride,
              right: -stride,
              maskImage: captionFade(stride),
              WebkitMaskImage: captionFade(stride)
            }}
          >
            <div
              className="absolute inset-y-0 flex items-center pl-2"
              style={{ left: stride, right: stride }}
            >
              {caption}
            </div>
          </div>
          <span aria-hidden className="flex-1" />
        </>
      )}
      <NavGroup />
    </div>
  )
}

function MonthGrid({
  className,
  children,
  ...props
}: HTMLAttributes<HTMLElement>) {
  return (
    <div
      data-slot="calendar-grid"
      className={cn("flex flex-col", className)}
      {...props}
    >
      {children}
    </div>
  )
}

function Weeks({ className, style, children }: HTMLAttributes<HTMLElement>) {
  const month = useContext(MonthContext)
  const grid = useGridContext()
  const height = useMotionValue<number | "auto">("auto")
  const measuredRef = useRef<{ month: number; h: number } | null>(null)
  const [clip, setClip] = useState(false)

  const onHeight = useCallback(
    (h: number, monthTime: number) => {
      const last = measuredRef.current
      measuredRef.current = { month: monthTime, h }
      if (!last || grid.reduceMotion || last.month === monthTime) {
        if (last?.month === monthTime && last.h === h) return
        height.jump(h)
        setClip(false)
        return
      }
      if (last.h === h) return
      setClip(true)
      animate(height, h, {
        ...spring.moderate,
        onComplete: () => setClip(false)
      })
    },
    [grid.reduceMotion, height]
  )

  const key = month ? month.date.getTime() : 0

  return (
    <motion.div
      data-slot="calendar-weeks"
      className={cn("relative grid", clip && "[overflow-y:clip]")}
      style={{ height }}
    >
      <AnimatePresence initial={false} custom={grid.direction}>
        <WeeksPanel
          key={key}
          monthTime={key}
          className={className}
          style={style}
          offset={grid.reduceMotion ? 0 : 10}
          stride={grid.stride}
          onHeight={onHeight}
        >
          {children}
        </WeeksPanel>
      </AnimatePresence>
    </motion.div>
  )
}

function WeeksPanel({
  className,
  style,
  children,
  monthTime,
  offset,
  stride,
  onHeight
}: Readonly<{
  className?: string
  style?: CSSProperties
  children: ReactNode
  monthTime: number
  offset: number
  stride: number | null
  onHeight: (h: number, monthTime: number) => void
}>) {
  const present = useIsPresent()
  const month = useContext(MonthContext)
  const { formatters, labels } = useDayPicker()
  const { direction } = useGridContext()
  const ref = useRef<HTMLDivElement>(null)
  const firstWeek = month?.weeks[0]?.days ?? []
  useIsoLayoutEffect(() => {
    const el = ref.current
    if (!el || !present) return undefined
    onHeight(el.offsetHeight, monthTime)
    if (typeof ResizeObserver === "undefined") return undefined
    const ro = new ResizeObserver(() => onHeight(el.offsetHeight, monthTime))
    ro.observe(el)
    return () => ro.disconnect()
  }, [present, onHeight, monthTime])
  return (
    <PanelPresentContext.Provider value={present}>
      <motion.div
        ref={ref}
        role="rowgroup"
        aria-hidden={present ? undefined : true}
        className={cn(
          "col-start-1 row-start-1 flex flex-col self-start",
          !present && "pointer-events-none",
          className
        )}
        style={style}
        variants={slideVariants(offset, stride)}
        custom={direction}
        initial="enter"
        animate="center"
        exit="exit"
      >
        <div role="row" {...{ [INERT_ATTR]: "" }} className="flex">
          {firstWeek.map((day) => (
            <span
              key={day.isoDate}
              role="columnheader"
              aria-label={labels.labelWeekday(
                day.date,
                day.dateLib.options,
                day.dateLib
              )}
              className="flex h-[calc(var(--cell-size)*0.8)] w-[var(--cell-size)] items-center justify-center text-caption text-muted-foreground supports-[width:round(1px,1px)]:h-[round(down,calc(var(--cell-size)*0.8),1px)]"
            >
              {formatters.formatWeekdayName(
                day.date,
                day.dateLib.options,
                day.dateLib
              )}
            </span>
          ))}
        </div>
        {children}
      </motion.div>
    </PanelPresentContext.Provider>
  )
}

function Week({ className, style, children }: WeekProps) {
  return (
    <div role="row" className={cn("flex", className)} style={style}>
      {children}
    </div>
  )
}

const corner = (edge: boolean, touching: boolean) =>
  edge && !touching ? "8px" : 0

function Day({
  day,
  modifiers,
  className,
  style,
  children,
  "aria-selected": ariaSelected,
  "aria-label": ariaLabel
}: DayProps) {
  const grid = useGridContext()
  const weeks = useContext(MonthContext)?.weeks
  const n = dayNumber(day.date)
  const visible = !modifiers.hidden
  const firstDate = weeks?.[0]?.days[0]?.date
  const lastDate = weeks?.at(-1)?.days.at(-1)?.date
  const gridFirst = firstDate ? dayNumber(firstDate) : n
  const gridLast = lastDate ? dayNumber(lastDate) : n
  const weekday = (((n - gridFirst) % 7) + 7) % 7
  const drawn = (d: number) => d >= gridFirst && d <= gridLast
  const slice = (band: Band | null): CSSProperties | null => {
    if (
      !band ||
      !visible ||
      band.from === band.to ||
      n < band.from ||
      n > band.to
    )
      return null
    const edgeLeft = n > band.from && weekday === 0
    const edgeRight = n < band.to && weekday === 6
    const atLeft = (d: number) => drawn(d) && d > band.from && d <= band.to
    const atRight = (d: number) => drawn(d) && d >= band.from && d < band.to
    return {
      left: n > band.from ? 0 : "50%",
      right: n < band.to ? 0 : "50%",
      borderTopLeftRadius: corner(edgeLeft, atLeft(n - 7)),
      borderBottomLeftRadius: corner(edgeLeft, atLeft(n + 7)),
      borderTopRightRadius: corner(edgeRight, atRight(n - 7)),
      borderBottomRightRadius: corner(edgeRight, atRight(n + 7))
    }
  }
  const bandSlice = slice(grid.band)
  const { ghost } = grid
  const ghostSlice = slice(ghost)
  const ghostEnd = !!ghost && visible && (n === ghost.from || n === ghost.to)

  return (
    <div
      role="gridcell"
      aria-selected={ariaSelected}
      aria-label={ariaLabel}
      data-day={day.isoDate}
      data-today={modifiers.today || undefined}
      data-outside={day.outside || undefined}
      data-hidden={modifiers.hidden || undefined}
      className={cn(
        "relative flex size-[var(--cell-size)] items-center justify-center p-0",
        className
      )}
      style={style}
    >
      <AnimatePresence>
        {ghost && (ghostSlice || ghostEnd) && (
          <motion.span
            key={ghost.id}
            aria-hidden
            data-slot="calendar-range-ghost"
            className="pointer-events-none absolute inset-0 flex items-center justify-center"
            initial={{ opacity: 1 }}
            animate={{ opacity: 0 }}
            transition={spring.moderate.exit}
          >
            {ghostSlice && (
              <span
                className="absolute inset-y-0 bg-foreground/[0.08]"
                style={ghostSlice}
              />
            )}
            {ghostEnd && (
              <span className="relative size-[var(--cell-size)] rounded-lg bg-foreground" />
            )}
          </motion.span>
        )}
      </AnimatePresence>
      {bandSlice && (
        <span
          aria-hidden
          data-slot="calendar-range-band"
          className="pointer-events-none absolute inset-y-0 bg-foreground/[0.08]"
          style={bandSlice}
        />
      )}
      {children}
    </div>
  )
}

function dayTone(
  isEnd: boolean,
  isPreviewEnd: boolean,
  unavailable: boolean,
  outside: boolean
) {
  if (isEnd) return "bg-foreground text-background"
  if (isPreviewEnd) return "cursor-pointer text-background"
  if (unavailable) return "cursor-default text-muted-foreground opacity-50"
  if (outside) return "cursor-pointer text-muted-foreground opacity-60"
  return "cursor-pointer text-foreground"
}

function DayButton({
  day,
  modifiers,
  className,
  style,
  children,
  ...props
}: DayButtonProps) {
  const cal = useCalendarContext()
  const grid = useGridContext()
  const present = useContext(PanelPresentContext)
  const ref = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    if (modifiers.focused && present) ref.current?.focus()
  }, [modifiers.focused, present])

  const n = dayNumber(day.date)
  const index = n - grid.gridStart
  useRegisterFluidHoverItem(
    present && !day.outside ? grid.registerItem : undefined,
    index,
    ref
  )

  const { band } = grid
  const from = cal.range?.from
  const isEnd = cal.isEnd(n)
  const isPreviewEnd =
    cal.picking && grid.previewEnd === n && !(from && dayNumber(from) === n)
  const unavailable = modifiers.disabled

  return (
    <button
      ref={ref}
      {...props}
      tabIndex={present ? props.tabIndex : -1}
      {...{
        [INDEX_ATTR]: day.outside ? undefined : index,
        [INERT_ATTR]: unavailable ? "" : undefined
      }}
      data-selected={isEnd || undefined}
      data-range-middle={(!!band && n > band.from && n < band.to) || undefined}
      data-unavailable={unavailable || undefined}
      data-preview-end={isPreviewEnd || undefined}
      className={cn(
        "relative z-[2] flex items-center justify-center p-0 tabular-nums outline-none select-none",
        cal.picking
          ? "transition-[color] duration-80"
          : grid.committedEnd === n
            ? "transition-none"
            : "transition-[color,background-color,font-variation-settings] duration-80",
        "size-[var(--cell-size)] rounded-lg text-body",
        dayTone(isEnd, isPreviewEnd, unavailable, day.outside),
        className
      )}
      style={{
        ...style,
        fontVariationSettings: modifiers.today
          ? fontWeights.semibold
          : fontWeights.normal
      }}
    >
      <span className="[text-box:trim-both_cap_alphabetic]">{children}</span>
      {modifiers.today && (
        <span
          aria-hidden
          data-slot="calendar-today-dot"
          className="absolute bottom-[14%] left-1/2 size-1 -translate-x-1/2 rounded-full bg-current"
        />
      )}
    </button>
  )
}

function Root({ rootRef: _rootRef, ...props }: RootProps) {
  return <div data-slot="calendar" {...props} />
}

const components = {
  Root,
  Months,
  Month,
  MonthCaption,
  MonthGrid,
  Weeks,
  Week,
  Day,
  DayButton
} satisfies Partial<CustomComponents>

type CalendarProps = Readonly<
  Pick<DayPickerProps, "disabled" | "defaultMonth">
> &
  (
    | Readonly<{
        mode: "single"
        selected?: Date
        onSelect: (date: Date | undefined) => void
      }>
    | Readonly<{
        mode: "range"
        selected?: DateRange
        onSelect: (range: DateRange | undefined) => void
      }>
  )

function Calendar(props: CalendarProps) {
  const { disabled, defaultMonth } = props
  const range = props.mode === "range" ? props.selected : undefined
  const picking = !!range?.from && !range.to
  const selectedDay =
    props.mode === "single" && props.selected
      ? dayNumber(props.selected)
      : null
  const beforePickRef = useRef<DateRange | undefined>(undefined)

  const disabledMatchers = useMemo(() => flatMatchers(disabled), [disabled])

  const ctx = useMemo<CalendarContextValue>(() => {
    const from = range?.from ? dayNumber(range.from) : null
    const to = range?.to && !picking ? dayNumber(range.to) : null
    return {
      range,
      picking,
      disabledMatchers,
      isEnd: (n) => n === selectedDay || n === from || n === to
    }
  }, [range, picking, disabledMatchers, selectedDay])

  const handleKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key !== "Escape" || !picking || props.mode !== "range") return
    e.stopPropagation()
    props.onSelect(beforePickRef.current)
  }

  const shared = {
    autoFocus: true,
    defaultMonth,
    showOutsideDays: true,
    hideNavigation: true,
    hideWeekdays: true,
    disabled: disabledMatchers,
    components,
    className: "rounded-[inherit] bg-inherit p-2"
  }

  return (
    <CalendarContext.Provider value={ctx}>
      <div
        data-slot="calendar-root"
        role="presentation"
        className="w-fit rounded-[inherit] bg-inherit [--cell-size:36px]"
        onKeyDown={handleKeyDown}
      >
        {props.mode === "range" ? (
          <DayPicker
            {...shared}
            mode="range"
            selected={props.selected}
            excludeDisabled
            resetOnSelect
            onSelect={(next: DateRange | undefined) => {
              if (next?.from && !next.to && !picking)
                beforePickRef.current = range
              props.onSelect(next)
            }}
          />
        ) : (
          <DayPicker
            {...shared}
            mode="single"
            selected={props.selected}
            onSelect={(next: Date | undefined) => props.onSelect(next)}
          />
        )}
      </div>
    </CalendarContext.Provider>
  )
}

export { Calendar }
export type { DateRange }
