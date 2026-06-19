import { Result, useAtomSet, useAtomValue } from "@effect-atom/atom-react"
import { Info } from "lucide-react"
import { useState } from "react"
import type { TicketDetail } from "@projectproject/shared"
import { everhourProfileAtom } from "@/atoms/everhour"
import {
  activeTimerAtom,
  startTicketTimerAtom,
  stopTimerAtom,
  ticketKey,
  ticketTimeAtom,
  workTypesForTicketAtom
} from "@/atoms/timeTracking"
import { ConnectEverhourInline } from "@/components/time/ConnectEverhourInline"
import { LogTimeForm } from "@/components/time/LogTimeForm"
import { WorkTypeSelect } from "@/components/time/WorkTypeSelect"
import { ErrorPage } from "@/components/ErrorPage"
import { Button } from "@/components/ui/button"
import {
  Popover,
  PopoverContent,
  PopoverTrigger
} from "@/components/ui/popover"
import * as m from "@/paraglide/messages"

export const formatDuration = (seconds: number): string => {
  const total = Math.max(0, Math.round(seconds / 60))
  const hours = Math.floor(total / 60)
  const minutes = total % 60
  if (hours === 0 && minutes === 0) return "0m"
  return [hours > 0 ? `${hours}h` : null, minutes > 0 ? `${minutes}m` : null]
    .filter((part): part is string => part !== null)
    .join(" ")
}

export function TicketTimePanel({
  orgSlug,
  slug,
  ticket
}: {
  orgSlug: string
  slug: string
  ticket: TicketDetail
}) {
  const tKey = ticketKey(orgSlug, slug, ticket.id)
  const profileResult = useAtomValue(everhourProfileAtom)
  const workTypesResult = useAtomValue(workTypesForTicketAtom(tKey))
  const timeResult = useAtomValue(ticketTimeAtom(tKey))
  const activeTimerResult = useAtomValue(activeTimerAtom(orgSlug))
  const start = useAtomSet(startTicketTimerAtom(tKey), { mode: "promiseExit" })
  const startState = useAtomValue(startTicketTimerAtom(tKey))
  const stop = useAtomSet(stopTimerAtom(orgSlug), { mode: "promiseExit" })
  const stopState = useAtomValue(stopTimerAtom(orgSlug))
  const [workType, setWorkType] = useState<string | null>(null)
  const [showLog, setShowLog] = useState(false)

  if (profileResult.waiting && !Result.isSuccess(profileResult)) {
    return <div className="h-8 animate-pulse rounded bg-muted/40" />
  }

  const connected =
    Result.isSuccess(profileResult) && profileResult.value.connected
  if (!connected) {
    return <ConnectEverhourInline />
  }

  return Result.matchWithError(workTypesResult, {
    onInitial: () => <div className="h-8 animate-pulse rounded bg-muted/40" />,
    onError: (error) => <ErrorPage error={error} contained />,
    onDefect: (defect) => <ErrorPage error={defect} contained />,
    onSuccess: ({ value: options }) => {
      if (options.length === 0) {
        return (
          <p className="text-xs text-muted-foreground">
            {m.time_no_sprint_hint()}
          </p>
        )
      }
      const effectiveWorkType = workType ?? options[0].key
      const running =
        Result.isSuccess(activeTimerResult) &&
        activeTimerResult.value !== null &&
        activeTimerResult.value.ticketId === ticket.id
      const busy = startState.waiting || stopState.waiting
      const timePulse =
        timeResult.waiting || startState.waiting || stopState.waiting

      return (
        <div className="flex flex-col gap-3">
          <div
            className={
              timePulse
                ? "flex items-center gap-4 animate-pulse"
                : "flex items-center gap-4"
            }
          >
            <TrackedFigure
              label={m.time_tracked_total()}
              seconds={
                Result.isSuccess(timeResult) ? timeResult.value.totalSeconds : 0
              }
            />
            <TrackedFigure
              label={m.time_tracked_yours()}
              seconds={
                Result.isSuccess(timeResult) ? timeResult.value.userSeconds : 0
              }
            />
            <Popover>
              <PopoverTrigger
                aria-label={m.time_sync_explainer()}
                className="ml-auto inline-flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground transition-all duration-100 hover:text-foreground active:scale-[0.97]"
              >
                <Info className="h-4 w-4" />
              </PopoverTrigger>
              <PopoverContent className="w-72 text-xs text-muted-foreground">
                {m.time_sync_explainer()}
              </PopoverContent>
            </Popover>
          </div>

          <div className="flex items-center gap-2">
            <WorkTypeSelect
              value={effectiveWorkType}
              onChange={setWorkType}
              options={options}
              disabled={running || busy}
            />
            {running ? (
              <Button
                type="button"
                variant="secondary"
                size="sm"
                disabled={busy}
                onClick={() => void stop()}
              >
                {m.time_stop_button()}
              </Button>
            ) : (
              <Button
                type="button"
                size="sm"
                disabled={busy}
                onClick={() =>
                  void start({ workTypeKey: effectiveWorkType })
                }
              >
                {m.time_start_button()}
              </Button>
            )}
          </div>

          {showLog ? (
            <LogTimeForm
              orgSlug={orgSlug}
              slug={slug}
              ticketId={ticket.id}
              options={options}
              defaultWorkType={effectiveWorkType}
              onDone={() => setShowLog(false)}
            />
          ) : (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="self-start"
              onClick={() => setShowLog(true)}
            >
              {m.time_log_button()}
            </Button>
          )}
        </div>
      )
    }
  })
}

function TrackedFigure({
  label,
  seconds
}: {
  label: string
  seconds: number
}) {
  return (
    <div className="flex flex-col">
      <span className="text-xs text-muted-foreground">{label}</span>
      <span className="text-sm font-medium tabular-nums">
        {formatDuration(seconds)}
      </span>
    </div>
  )
}
