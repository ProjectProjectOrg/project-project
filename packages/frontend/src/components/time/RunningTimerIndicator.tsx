import { Result, useAtomSet, useAtomValue } from "@effect-atom/atom-react"
import { Link } from "@tanstack/react-router"
import * as DateTime from "effect/DateTime"
import { Timer } from "lucide-react"
import { useEffect, useState } from "react"
import { activeTimerAtom, stopTimerAtom } from "@/atoms/timeTracking"
import { Button } from "@/components/ui/button"
import * as m from "@/paraglide/messages"

const elapsedSeconds = (startedAt: Date): number =>
  Math.max(
    0,
    Math.floor(
      (DateTime.toEpochMillis(DateTime.unsafeNow()) - startedAt.getTime()) /
        1000
    )
  )

const formatClock = (seconds: number): string => {
  const hours = Math.floor(seconds / 3600)
  const minutes = Math.floor((seconds % 3600) / 60)
  const secs = seconds % 60
  const pad = (value: number) => `${value}`.padStart(2, "0")
  return hours > 0
    ? `${hours}:${pad(minutes)}:${pad(secs)}`
    : `${minutes}:${pad(secs)}`
}

function useElapsed(startedAt: Date | null): number {
  const [seconds, setSeconds] = useState(() =>
    startedAt ? elapsedSeconds(startedAt) : 0
  )
  useEffect(() => {
    if (!startedAt) {
      setSeconds(0)
      return
    }
    let frame = 0
    const loop = () => {
      setSeconds(elapsedSeconds(startedAt))
      frame = requestAnimationFrame(loop)
    }
    frame = requestAnimationFrame(loop)
    return () => cancelAnimationFrame(frame)
  }, [startedAt])
  return seconds
}

export function RunningTimerIndicator({ orgSlug }: { orgSlug: string }) {
  const activeTimerResult = useAtomValue(activeTimerAtom(orgSlug))
  const stop = useAtomSet(stopTimerAtom(orgSlug), { mode: "promiseExit" })
  const stopState = useAtomValue(stopTimerAtom(orgSlug))
  const timer = Result.isSuccess(activeTimerResult)
    ? activeTimerResult.value
    : null
  const elapsed = useElapsed(timer ? timer.startedAt : null)

  if (!timer) return null

  const label =
    timer.ticketId !== null
      ? `${timer.ticketId} · ${timer.workTypeLabel}`
      : timer.workTypeLabel
  const stopButton = (
    <Button
      type="button"
      variant="ghost"
      size="xs"
      disabled={stopState.waiting}
      onClick={(event) => {
        event.preventDefault()
        event.stopPropagation()
        void stop()
      }}
    >
      {m.time_stop_button()}
    </Button>
  )

  const content = (
    <span className="flex items-center gap-2">
      <Timer className="size-4 text-primary" strokeWidth={1.75} />
      <span className="truncate text-[13px]">{label}</span>
      <span className="font-mono text-xs tabular-nums text-muted-foreground">
        {formatClock(elapsed)}
      </span>
    </span>
  )

  return (
    <div className="flex items-center gap-1 rounded-lg bg-accent/60 px-2 py-1">
      {timer.ticketId !== null ? (
        <Link
          to="/orgs/$orgSlug/projects/$slug/tickets/$id"
          params={{ orgSlug, slug: timer.slug, id: timer.ticketId }}
          aria-label={m.time_timer_running_on({ label })}
          className="min-w-0 transition-colors hover:text-foreground"
        >
          {content}
        </Link>
      ) : (
        content
      )}
      {stopButton}
    </div>
  )
}
