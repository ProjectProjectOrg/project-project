import { useAtomSet, useAtomValue } from "@effect/atom-react"
import type { TicketDetail } from "@pp/shared"
import * as Result from "effect/reactivity/AsyncResult"
import * as Schema from "effect/Schema"
import { Info } from "lucide-react"
import { useState } from "react"

import { AsyncView } from "@/components/shell/AsyncView"
import {
  Popover,
  PopoverContent,
  PopoverTrigger
} from "@/components/ui/popover"
import { currentUserId } from "@/features/auth/atoms/auth"
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
import { ConnectEverhourInline } from "@/features/everhour/components/ConnectEverhourInline"
import { EverhourSetupHint } from "@/features/everhour/components/EverhourSetupHint"
import { TimeControls } from "@/features/everhour/components/TimeControls"
import { LogTimeForm } from "@/features/everhour/forms/log-time"
import { useProjectRoute } from "@/features/projects/hooks/useProject"
import { useProjectActor } from "@/hooks/useActor"
import {
  createLocalStorageCodec,
  useLocalStorageState
} from "@/hooks/useLocalStorageState"
import { formatDuration } from "@/lib/duration"
import { mutationErrorText } from "@/lib/mutationError"
import * as m from "@/paraglide/messages"

const dismissedCodec = createLocalStorageCodec(Schema.Boolean)

export function TicketTimeSection({ ticket }: { ticket: TicketDetail }) {
  const { orgSlug, slug } = useProjectRoute()
  const viewerId = useAtomValue(currentUserId)
  const [hintDismissed, setHintDismissed] = useLocalStorageState(
    `projectproject:everhour-setup-hint-dismissed:${viewerId ?? ""}:${orgSlug}/${slug}`,
    dismissedCodec,
    false
  )
  const statusResult = useAtomValue(
    everhourProjectStatusAtom(everhourProjectRequest(orgSlug, slug))
  )
  const actor = useProjectActor()
  const canManage = actor.call("everhour", "connectProject")
  const canLog = actor.call("everhour", "logTime")

  const notConnected =
    Result.isSuccess(statusResult) &&
    statusResult.value.status === "not_connected"
  if (notConnected && (!canManage || hintDismissed)) return null

  return (
    <div className="mt-1 w-full">
      <AsyncView
        result={statusResult}
        contained
        onInitial={() => (
          <div className="h-8 animate-pulse rounded bg-muted/40" />
        )}
        onSuccess={({ value }) =>
          value.status === "not_connected" ? (
            <EverhourSetupHint onDismiss={() => setHintDismissed(true)} />
          ) : canLog ? (
            <TicketTimePanel ticket={ticket} />
          ) : (
            <TicketTimeTotal ticket={ticket} />
          )
        }
      />
    </div>
  )
}

export function TicketTimePanel({ ticket }: { ticket: TicketDetail }) {
  const { orgSlug, slug } = useProjectRoute()
  const req = ticketTimeRequest(orgSlug, slug, ticket.id)
  const panelResult = useAtomValue(ticketTimePanelAtom(req))
  const start = useAtomSet(startTicketTimerAtom(req), {
    mode: "promiseExit"
  })
  const startState = useAtomValue(startTicketTimerAtom(req))
  const stop = useAtomSet(stopTicketTimerAtom(req), { mode: "promiseExit" })
  const stopState = useAtomValue(stopTicketTimerAtom(req))
  const timerError =
    mutationErrorText(startState) ?? mutationErrorText(stopState)
  const [workType, setWorkType] = useState<string | null>(null)
  const [showLog, setShowLog] = useState(false)

  return (
    <AsyncView
      result={panelResult}
      contained
      onInitial={() => (
        <div className="h-16 animate-pulse rounded bg-muted/40" />
      )}
      onSuccess={({ value: panel, waiting }) => {
        if (!panel.profile.connected) return <ConnectEverhourInline />
        const options = panel.workTypes
        if (options.length === 0) {
          return (
            <p className="text-caption text-muted-foreground">
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
                <PopoverContent className="w-72 text-caption text-muted-foreground">
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
              error={timerError}
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
      }}
    />
  )
}

function TicketTimeTotal({
  ticket
}: Readonly<{
  ticket: TicketDetail
}>) {
  const { orgSlug, slug } = useProjectRoute()
  const result = useAtomValue(
    ticketTimeAtom(ticketTimeRequest(orgSlug, slug, ticket.id))
  )
  return (
    <AsyncView
      result={result}
      contained
      onInitial={() => (
        <div className="h-8 animate-pulse rounded bg-muted/40" />
      )}
      onSuccess={({ value }) => (
        <div className="flex items-center gap-5 tabular-nums">
          <TrackedFigure
            label={m.time_tracked_total()}
            seconds={value.totalSeconds}
          />
        </div>
      )}
    />
  )
}

function TrackedFigure({ label, seconds }: { label: string; seconds: number }) {
  return (
    <div className="flex min-w-20 flex-col">
      <span className="text-caption text-muted-foreground">{label}</span>
      <span className="text-body font-semibold tabular-nums">
        {formatDuration(seconds)}
      </span>
    </div>
  )
}
