import { cn } from "../lib/utils"

/*
 * Done out of total as a small pie and "3/5", for a ticket's sub-tickets.
 *
 *   <ProgressCount done={3} total={5} label="3 of 5 sub-tickets done" />
 */

// Drawn to sit with the 12px stroke icons beside it (priority, links, the
// estimate): a 12px pie with a ~1.1px ring, not a heavier badge.
const RADIUS = 5.6
const STROKE = 1.3
const CIRCUMFERENCE = 2 * Math.PI * RADIUS

export function ProgressPie({
  done,
  total,
  className
}: Readonly<{ done: number; total: number; className?: string }>) {
  const share = total > 0 ? done / total : 0
  return (
    <svg
      viewBox="0 0 14 14"
      aria-hidden
      className={cn("size-3 shrink-0 -rotate-90", className)}
    >
      <circle
        cx="7"
        cy="7"
        r={RADIUS}
        fill="none"
        strokeWidth={STROKE}
        className="stroke-border"
      />
      <circle
        cx="7"
        cy="7"
        r={RADIUS}
        fill="none"
        strokeWidth={STROKE}
        strokeDasharray={`${share * CIRCUMFERENCE} ${CIRCUMFERENCE}`}
        className="stroke-muted-foreground"
      />
    </svg>
  )
}

export function ProgressCount({
  done,
  total,
  label,
  tone = "muted",
  className
}: Readonly<{
  done: number
  total: number
  // Read out and shown on hover, for example "3 of 5 sub-tickets done".
  label?: string
  // Inherit takes the colour of the chip it sits in.
  tone?: "muted" | "inherit"
  className?: string
}>) {
  return (
    <span
      title={label}
      className={cn(
        "inline-flex shrink-0 items-center gap-1",
        tone === "muted" && "text-muted-foreground",
        className
      )}
    >
      <ProgressPie done={done} total={total} />
      <span className="text-caption tabular-nums">
        {done}/{total}
      </span>
    </span>
  )
}
