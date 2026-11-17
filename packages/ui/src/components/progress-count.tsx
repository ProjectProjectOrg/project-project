import { cn } from "../lib/utils"

/*
 * Done out of total as a small pie and "3/5", for a ticket's sub-tickets.
 *
 *   <ProgressCount done={3} total={5} label="3 of 5 sub-tickets done" />
 */

const RADIUS = 5
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
      className={cn("size-3.5 shrink-0 -rotate-90", className)}
    >
      <circle
        cx="7"
        cy="7"
        r={RADIUS}
        fill="none"
        strokeWidth="2"
        className="stroke-border"
      />
      <circle
        cx="7"
        cy="7"
        r={RADIUS}
        fill="none"
        strokeWidth="2"
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
  className
}: Readonly<{
  done: number
  total: number
  // Read out and shown on hover, for example "3 of 5 sub-tickets done".
  label?: string
  className?: string
}>) {
  return (
    <span
      title={label}
      className={cn(
        "inline-flex shrink-0 items-center gap-1 text-muted-foreground",
        className
      )}
    >
      <ProgressPie done={done} total={total} />
      <span className="font-mono text-caption tabular-nums">
        {done}/{total}
      </span>
    </span>
  )
}
