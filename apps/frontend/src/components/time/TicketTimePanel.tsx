import { useAtomSet, useAtomValue } from "@effect/atom-react"
import type { TicketDetail } from "@pp/shared"
import * as Result from "effect/unstable/reactivity/AsyncResult"
import { Info } from "lucide-react"
import { useState } from "react"

import { ErrorPage } from "@/components/ErrorPage"
import { MetaRow } from "@/components/TicketPage/MetaRow"
import { ConnectEverhourInline } from "@/components/time/ConnectEverhourInline"
import { EverhourSetupHint } from "@/components/time/EverhourSetupHint"
import { LogTimeForm } from "@/components/time/LogTimeForm"
import { TimeControls } from "@/components/time/TimeControls"
import {
  Popover,
  PopoverContent,
  PopoverTrigger
} from "@/components/ui/popover"
import {
  everhourProjectRequest,
  everhourProjectStatusAtom
} from "@/features/everhour/atoms/everhour"
import {
  startTicketTimerAtom,
  stopTicketTimerAtom,
  ticketTimeAtom,
  ticketTimePanelAtom,
  ticketTimeRequest
} from "@/features/everhour/atoms/timeTracking"
import { useProjectCan } from "@/lib/access"
import * as m from "@/paraglide/messages"

export const formatDuration = (seconds: number): string => {
  const total = Math.max(0, Math.round(seconds / 60))
  const hours = Math.floor(total / 60)
  const minutes = total % 60
  if (hours === 0 && minutes === 0)
    return m.time_duration_minutes({ minutes: 0 })
  return [
    ...(hours > 0 ? [m.time_duration_hours({ hours })] : []),
    ...(minutes > 0 ? [m.time_duration_minutes({ minutes })] : [])
  ].join(" ")
}

export function TicketTimeSection({
  orgSlug,
  slug,
  ticket
}: {
  orgSlug: string
  slug: string
  ticket: TicketDetail
}) {
  const statusResult = useAtomValue(
    everhourProjectStatusAtom(everhourProjectRequest(orgSlug, slug))
  )
  const can = useProjectCan()
  const canManage = can("everhour", "connectProject")
  const canLog = can("everhour", "logTime")

  const notConnected =
    Result.isSuccess(statusResult) &&
    statusResult.value.status === "not_connected"
  if (notConnected && !canManage) return null

  return (
    <MetaRow label={m.time_section_label()}>
      {Result.matchWithError(statusResult, {
        onInitial: () => (
          <div className="h-8 animate-pulse rounded bg-muted/40" />
        ),
        onError: (error) => <ErrorPage error={error} contained />,
        onDefect: (defect) => <ErrorPage error={defect} contained />,
        onSuccess: ({ value }) =>
          value.status === "not_connected" ? (
            <EverhourSetupHint orgSlug={orgSlug} slug={slug} />
          ) : canLog ? (
            <TicketTimePanel orgSlug={orgSlug} slug={slug} ticket={ticket} />
          ) : (
            <TicketTimeTotal orgSlug={orgSlug} slug={slug} ticket={ticket} />
          )
      })}
    </MetaRow>
  )
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
  const req = ticketTimeRequest(orgSlug, slug, ticket.id)
  const panelResult = useAtomValue(ticketTimePanelAtom(req))
  const start = useAtomSet(startTicketTimerAtom(req), {
    mode: "promiseExit"
  })
  const startState = useAtomValue(startTicketTimerAtom(req))
  const stop = useAtomSet(stopTicketTimerAtom(req), { mode: "promiseExit" })
  const stopState = useAtomValue(stopTicketTimerAtom(req))
  const [workType, setWorkType] = useState<string | null>(null)
  const [showLog, setShowLog] = useState(false)

  return Result.matchWithError(panelResult, {
    onInitial: () => <div className="h-16 animate-pulse rounded bg-muted/40" />,
    onError: (error) => <ErrorPage error={error} contained />,
    onDefect: (defect) => <ErrorPage error={defect} contained />,
    onSuccess: ({ value: panel, waiting }) => {
      if (!panel.profile.connected) return <ConnectEverhourInline />
      const options = panel.workTypes
      if (options.length === 0) {
        return (
          <p className="text-xs text-muted-foreground">
            {m.time_no_sprint_hint()}
          </p>
        )
      }
      const effectiveWorkType = workType ?? options[0].key
      const running =
        panel.activeTimer !== null && panel.activeTimer.ticketId === ticket.id
      const busy =
        startState.waiting || stopState.waiting || panelResult.waiting
      const timePulse = waiting || startState.waiting || stopState.waiting

      return (
        <div className="flex flex-col gap-3">
          <div
            className={
              timePulse
                ? "flex animate-pulse items-center gap-5 tabular-nums"
                : "flex items-center gap-5 tabular-nums"
            }
          >
            <TrackedFigure
              label={m.time_tracked_total()}
              seconds={panel.time.totalSeconds}
            />
            <TrackedFigure
              label={m.time_tracked_yours()}
              seconds={panel.time.userSeconds}
            />
            <Popover>
              <PopoverTrigger
                aria-label={m.time_sync_explainer()}
                className="ml-auto inline-flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground transition-colors duration-100 hover:text-foreground active:scale-[0.97]"
              >
                <Info className="h-4 w-4" />
              </PopoverTrigger>
              <PopoverContent className="w-72 text-xs text-muted-foreground">
                {m.time_sync_explainer()}
              </PopoverContent>
            </Popover>
          </div>

          <TimeControls
            value={effectiveWorkType}
            onValueChange={setWorkType}
            options={options}
            running={running}
            busy={busy}
            onStart={() => void start({ workTypeKey: effectiveWorkType })}
            onStop={() => void stop()}
            logOpen={showLog}
            onLogOpenChange={setShowLog}
          >
            <LogTimeForm
              orgSlug={orgSlug}
              slug={slug}
              ticketId={ticket.id}
              request={req}
              options={options}
              defaultWorkType={effectiveWorkType}
              onDone={() => setShowLog(false)}
            />
          </TimeControls>
        </div>
      )
    }
  })
}

function TicketTimeTotal({
  orgSlug,
  slug,
  ticket
}: {
  orgSlug: string
  slug: string
  ticket: TicketDetail
}) {
  const result = useAtomValue(
    ticketTimeAtom(ticketTimeRequest(orgSlug, slug, ticket.id))
  )
  return Result.matchWithError(result, {
    onInitial: () => <div className="h-8 animate-pulse rounded bg-muted/40" />,
    onError: (error) => <ErrorPage error={error} contained />,
    onDefect: (defect) => <ErrorPage error={defect} contained />,
    onSuccess: ({ value }) => (
      <TrackedFigure
        label={m.time_tracked_total()}
        seconds={value.totalSeconds}
      />
    )
  })
}

function TrackedFigure({ label, seconds }: { label: string; seconds: number }) {
  return (
    <div className="flex min-w-20 flex-col">
      <span className="text-xs text-muted-foreground">{label}</span>
      <span className="text-sm font-medium tabular-nums">
        {formatDuration(seconds)}
      </span>
    </div>
  )
}
