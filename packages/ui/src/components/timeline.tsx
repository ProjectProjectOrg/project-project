import { AnimatePresence, motion, useReducedMotion } from "motion/react"
import {
  Children,
  cloneElement,
  createContext,
  isValidElement,
  use,
  useCallback,
  useId,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ComponentProps,
  type CSSProperties,
  type ReactNode
} from "react"

import { railPath, railPoints } from "../lib/timelineRail"
import { cn } from "../lib/utils"
import { AvatarGroup } from "./avatar"
import { ChevronRight } from "./icons"

/*
 * A ticket's timeline: what happened to it, oldest or newest first, with its
 * comments in between. One rail runs through every mark; a run of changes
 * folds into one row that opens right under itself, one step in, and the
 * rail bends out to it with two squircle corners.
 *
 *   <Timeline>
 *     <TimelineEvent mark={<MemberAvatar … size={20} />} actor={…} time={…}>
 *       set status <TimelineChange from={…} to={…} toLabel={m.…()} />
 *     </TimelineEvent>
 *     <TimelineRun marks={…} label={…} time={…} open={open} onOpenChange={setOpen}>
 *       {foldedEvents}
 *     </TimelineRun>
 *     <TimelineEntry>{comment}</TimelineEntry>
 *   </Timeline>
 *
 * The rows start at --timeline-inset (0 by default); the ticket page sets it
 * so the marks line up with the boxes above.
 */

// One step in (22px): a run's changes and a comment's replies.
const indentClass = "pl-[1.375rem]"
const FOLD_SECONDS = 0.34
const EASE = [0.22, 1, 0.36, 1] as const

type Rail = Readonly<{ follow: (ms: number) => void }>

const RailContext = createContext<Rail | null>(null)

export function Timeline({
  className,
  children,
  ...props
}: ComponentProps<"ol">) {
  const rootRef = useRef<HTMLDivElement>(null)
  const pathRef = useRef<SVGPathElement>(null)
  const frame = useRef(0)
  const measure = useCallback(() => {
    const root = rootRef.current
    const path = pathRef.current
    if (root && path) path.setAttribute("d", railPath(railPoints(root)))
  }, [])
  // While a fold animates, the rail follows it every frame.
  const follow = useCallback(
    (ms: number) => {
      const until = performance.now() + ms
      cancelAnimationFrame(frame.current)
      const tick = () => {
        measure()
        if (performance.now() < until)
          frame.current = requestAnimationFrame(tick)
      }
      tick()
    },
    [measure]
  )
  useLayoutEffect(() => {
    const root = rootRef.current
    if (!root) return undefined
    measure()
    const resizes = new ResizeObserver(measure)
    resizes.observe(root)
    const rows = new MutationObserver(measure)
    rows.observe(root, { childList: true, subtree: true })
    return () => {
      resizes.disconnect()
      rows.disconnect()
      cancelAnimationFrame(frame.current)
    }
  }, [measure])
  const rail = useMemo(() => ({ follow }), [follow])
  return (
    <div
      ref={rootRef}
      data-slot="timeline"
      className={cn("relative [--timeline-inset:0px]", className)}
    >
      <svg
        aria-hidden
        className="pointer-events-none absolute inset-0 size-full overflow-visible"
      >
        <path
          ref={pathRef}
          className="fill-none stroke-border/60"
          strokeWidth={1}
          strokeLinecap="round"
        />
      </svg>
      <RailContext value={rail}>
        <ol className="relative" {...props}>
          {children}
        </ol>
      </RailContext>
    </div>
  )
}

// A mark on the rail: the rail runs through its centre. Events and runs
// place theirs; a comment wraps its author's avatar in one.
export function TimelineMark({ className, ...props }: ComponentProps<"span">) {
  return (
    <span
      data-rail-node
      className={cn(
        "relative z-10 grid shrink-0 place-items-center",
        className
      )}
      {...props}
    />
  )
}

// One step in: a comment's replies.
export function TimelineIndent({ className, ...props }: ComponentProps<"div">) {
  return <div className={cn(indentClass, className)} {...props} />
}

const lineClass =
  "min-w-0 text-body leading-5 wrap-anywhere text-muted-foreground"

function Time({ time }: Readonly<{ time: ReactNode }>) {
  if (time == null) return null
  return (
    <>
      <span aria-hidden> · </span>
      {time}
    </>
  )
}

// Rows that fold open right under what opens them (a run's changes, a
// thread's earlier replies): the height eases open, the rows come in one
// after another, and the rail follows the fold every frame while it moves.
// `list` makes it an <ol> of <li> rows; otherwise a stack of blocks.
export function TimelineFold({
  id,
  open,
  list = false,
  className,
  children
}: Readonly<{
  id?: string
  open: boolean
  list?: boolean
  className?: string
  children: ReactNode
}>) {
  const rail = use(RailContext)
  const reduce = useReducedMotion() ?? false
  const seconds = reduce ? 0 : FOLD_SECONDS
  const shown = useRef(open)
  useLayoutEffect(() => {
    if (shown.current === open) return
    shown.current = open
    rail?.follow(seconds * 1000 + 80)
  }, [open, rail, seconds])
  const rows = Children.toArray(children).map((row, index) =>
    isValidElement<{ style?: CSSProperties }>(row)
      ? cloneElement(row, {
          style: { ...row.props.style, "--timeline-row": index }
        })
      : row
  )
  const Rows = list ? "ol" : "div"
  return (
    <AnimatePresence initial={false}>
      {open && (
        <motion.div
          id={id}
          key="fold"
          data-rail-clip
          initial={{ height: 0 }}
          animate={{ height: "auto" }}
          exit={{ height: 0 }}
          transition={{ duration: seconds, ease: EASE }}
          className="overflow-clip"
        >
          <Rows data-slot="timeline-fold" className={className}>
            {rows}
          </Rows>
        </motion.div>
      )}
    </AnimatePresence>
  )
}

// Something that arrives while you watch (a comment you just placed, a
// reply): its space eases open, it rises into place, and the rail follows it
// down. Only what mounts with `appear` animates; what was already there
// shows as it is.
export function TimelineAppear({
  appear,
  className,
  children
}: Readonly<{ appear: boolean; className?: string; children: ReactNode }>) {
  const rail = use(RailContext)
  const reduce = useReducedMotion() ?? false
  const [animate] = useState(appear && !reduce)
  useLayoutEffect(() => {
    if (animate) rail?.follow(FOLD_SECONDS * 1000 + 80)
  }, [animate, rail])
  if (!animate) return <div className={className}>{children}</div>
  return (
    <motion.div
      initial={{ height: 0, opacity: 0 }}
      animate={{ height: "auto", opacity: 1 }}
      transition={{ duration: FOLD_SECONDS, ease: EASE }}
      className={cn("overflow-clip", className)}
    >
      <motion.div
        initial={{ y: 8, filter: "blur(2px)" }}
        animate={{ y: 0, filter: "blur(0px)" }}
        transition={{ duration: FOLD_SECONDS, ease: EASE }}
      >
        {children}
      </motion.div>
    </motion.div>
  )
}

// For something that changes the rail's shape over time (a swap that eases
// open): has the rail follow it for `ms`.
export function useTimelineRailFollow() {
  const rail = use(RailContext)
  return useCallback((ms: number) => rail?.follow(ms), [rail])
}

export const timelineEase = EASE
export const timelineFoldSeconds = FOLD_SECONDS

// One event: the actor's 20px mark on the rail, then "Ana set status …
// · 2h ago" in one muted line with the names and values in ink.
export function TimelineEvent({
  mark,
  actor,
  time,
  className,
  children,
  ...props
}: Omit<ComponentProps<"li">, "children"> &
  Readonly<{
    mark: ReactNode
    actor: ReactNode
    time?: ReactNode
    children: ReactNode
  }>) {
  return (
    <li
      data-slot="timeline-event"
      className={cn(
        "grid grid-cols-[20px_minmax(0,1fr)] gap-x-2 py-2 pl-(--timeline-inset)",
        className
      )}
      {...props}
    >
      <TimelineMark className="h-5">{mark}</TimelineMark>
      <div className={lineClass}>
        {actor} {children}
        <Time time={time} />
      </div>
    </li>
  )
}

// A folded run of changes: the people in it as a 20px stack, a line ("Ana
// and 2 others made 6 changes") that opens it, and the changes themselves,
// which unfold right under it, one step in, in the order they're given.
export function TimelineRun({
  marks,
  label,
  time,
  open,
  onOpenChange,
  children
}: Readonly<{
  marks: ReactNode
  label: ReactNode
  time?: ReactNode
  open: boolean
  onOpenChange: (open: boolean) => void
  children: ReactNode
}>) {
  const id = useId()
  return (
    <li data-slot="timeline-run">
      <div className="grid grid-cols-[auto_minmax(0,1fr)] items-center gap-x-2 py-2 pl-(--timeline-inset)">
        <span className="relative z-10">
          <span
            data-rail-node
            aria-hidden
            className="absolute top-0 left-0 size-5"
          />
          <AvatarGroup
            className="h-5 items-center [--avatar-overlap:--spacing(1.5)]"
            style={{ "--avatar-size": "20px" }}
          >
            {marks}
          </AvatarGroup>
        </span>
        <button
          type="button"
          aria-expanded={open}
          aria-controls={id}
          onClick={() => onOpenChange(!open)}
          className="group flex min-w-0 cursor-pointer items-center gap-1 text-left text-body leading-5 text-muted-foreground transition-colors hover:text-foreground hover:duration-0"
        >
          <span className="min-w-0">
            {label}
            <Time time={time} />
          </span>
          <ChevronRight
            aria-hidden
            className={cn(
              "size-3.5 shrink-0 transition-transform duration-300 ease-standard",
              open && "rotate-90"
            )}
          />
        </button>
      </div>
      <TimelineFold id={id} open={open} list className={indentClass}>
        {children}
      </TimelineFold>
    </li>
  )
}

// A slot in the timeline for something that isn't an event: a comment.
export function TimelineEntry({ className, ...props }: ComponentProps<"li">) {
  return (
    <li
      data-slot="timeline-entry"
      className={cn("py-2.5 pl-(--timeline-inset)", className)}
      {...props}
    />
  )
}

// Who did it, in ink; `via` adds the client an agent acted through, muted.
export function TimelineActor({
  via,
  children
}: Readonly<{ via?: ReactNode; children: ReactNode }>) {
  return (
    <span className="font-semibold">
      {children}
      {via != null && (
        <>
          {" "}
          <span className="font-normal text-muted-foreground">{via}</span>
        </>
      )}
    </span>
  )
}

// A value in a line (a status, a priority, a sprint, a person): its icon or
// avatar and its name, in ink, kept on one line.
export function TimelineValue({
  icon,
  children
}: Readonly<{ icon?: ReactNode; children: ReactNode }>) {
  return (
    <span className="inline-flex items-center gap-1 align-bottom whitespace-nowrap text-foreground [&>[data-slot=avatar]]:translate-y-px [&>svg]:size-3.5 [&>svg]:shrink-0 [&>svg]:translate-y-px">
      {icon}
      {children}
    </span>
  )
}

// Several values side by side (people, tags), wrapping as a group.
export function TimelineValues({
  className,
  ...props
}: ComponentProps<"span">) {
  return (
    <span
      className={cn(
        "inline-flex flex-wrap items-center gap-x-2 gap-y-1 align-bottom",
        className
      )}
      {...props}
    />
  )
}

// A literal: a branch name, a ticket key.
export function TimelineLiteral({
  children
}: Readonly<{ children: ReactNode }>) {
  return <span className="text-body tabular-nums">{children}</span>
}

// "from → to"; the arrow is hidden from screen readers, which hear `toLabel`.
export function TimelineChange({
  from,
  to,
  toLabel
}: Readonly<{ from: ReactNode; to: ReactNode; toLabel: string }>) {
  return (
    <>
      {from}
      <span aria-hidden="true" className="mx-1">
        →
      </span>
      <span className="sr-only"> {toLabel} </span>
      {to}
    </>
  )
}

// Quoted text under the line (a comment that was edited or removed).
export function TimelineQuote({ className, ...props }: ComponentProps<"div">) {
  return (
    <div
      className={cn(
        "mt-1 border-l-2 border-border pl-2.5 text-foreground",
        className
      )}
      {...props}
    />
  )
}

// While the activity loads: two pulsing lines, announced with `label`.
export function TimelineSkeleton({ label }: Readonly<{ label: string }>) {
  return (
    <div role="status" aria-busy="true" className="space-y-2">
      <span className="sr-only">{label}</span>
      <div className="h-4 w-2/3 animate-pulse rounded bg-muted" />
      <div className="h-4 w-1/2 animate-pulse rounded bg-muted" />
    </div>
  )
}
