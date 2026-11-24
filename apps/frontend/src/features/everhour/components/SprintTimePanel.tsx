import { useAtomSet, useAtomValue } from "@effect/atom-react"
import { DEFAULT_WORK_TYPES, type GroupId } from "@pp/shared"
import * as Result from "effect/reactivity/AsyncResult"
import { useState } from "react"

import { AsyncView } from "@/components/shell/AsyncView"
import {
  everhourProjectRequest,
  everhourProfileAtom,
  everhourProjectStatusAtom
} from "@/features/everhour/atoms/everhour"
import {
  activeTimerRequest,
  activeTimerAtom,
  sprintTimerRequest,
  startSprintTimerAtom,
  stopTimerAtom
} from "@/features/everhour/atoms/timeTracking"
import { ConnectEverhourInline } from "@/features/everhour/components/ConnectEverhourInline"
import { EverhourSetupHint } from "@/features/everhour/components/EverhourSetupHint"
import { TimeControls } from "@/features/everhour/components/TimeControls"
import { LogTimeForm } from "@/features/everhour/forms/log-time"
import { useProjectActor } from "@/hooks/useActor"
import { mutationErrorText } from "@/lib/mutationError"

const options = DEFAULT_WORK_TYPES.map((workType) => ({
  key: workType.key,
  label: workType.label
}))

type SprintPanelProps = Readonly<{
  orgSlug: string
  slug: string
  groupId: GroupId
}>

export function SprintTimePanel({ orgSlug, slug, groupId }: SprintPanelProps) {
  const timerReq = activeTimerRequest(orgSlug)
  const sprintReq = sprintTimerRequest(orgSlug, slug, groupId)
  const startKey = { timerReq, sprintReq }
  const activeTimerResult = useAtomValue(activeTimerAtom(timerReq))
  const start = useAtomSet(startSprintTimerAtom(startKey), {
    mode: "promiseExit"
  })
  const startState = useAtomValue(startSprintTimerAtom(startKey))
  const stop = useAtomSet(stopTimerAtom(timerReq), { mode: "promiseExit" })
  const stopState = useAtomValue(stopTimerAtom(timerReq))
  const [workType, setWorkType] = useState(options[0].key)
  const [showLog, setShowLog] = useState(false)

  const busy =
    startState.waiting || stopState.waiting || activeTimerResult.waiting
  const timerError =
    mutationErrorText(startState) ?? mutationErrorText(stopState)

  const timer = Result.isSuccess(activeTimerResult)
    ? activeTimerResult.value
    : null
  const running =
    timer !== null && timer.ticketId === null && timer.groupId === groupId
  return (
    <SprintTimeAccess orgSlug={orgSlug} slug={slug}>
      {Result.isSuccess(activeTimerResult) ? (
        <div className="flex flex-col gap-2">
          <TimeControls
            value={workType}
            onValueChange={setWorkType}
            options={options}
            running={running}
            busy={busy}
            error={timerError}
            onStart={() => void start({ workTypeKey: workType })}
            onStop={() => void stop()}
            logOpen={showLog}
            onLogOpenChange={setShowLog}
          >
            <LogTimeForm
              orgSlug={orgSlug}
              slug={slug}
              ticketId={null}
              groupId={groupId}
              options={options}
              defaultWorkType={workType}
              onDone={() => setShowLog(false)}
            />
          </TimeControls>
        </div>
      ) : (
        <AsyncView
          result={activeTimerResult}
          contained
          onInitial={() => (
            <div className="h-8 animate-pulse rounded bg-muted/40" />
          )}
          onSuccess={() => null}
        />
      )}
    </SprintTimeAccess>
  )
}

function SprintTimeAccess({
  orgSlug,
  slug,
  children
}: Readonly<{ orgSlug: string; slug: string; children: React.ReactNode }>) {
  const statusResult = useAtomValue(
    everhourProjectStatusAtom(everhourProjectRequest(orgSlug, slug))
  )
  const canManage = useProjectActor().call("everhour", "connectProject")
  const profileResult = useAtomValue(everhourProfileAtom)
  const notConnected =
    Result.isSuccess(statusResult) &&
    statusResult.value.status === "not_connected"
  if (notConnected) {
    return canManage ? <EverhourSetupHint /> : null
  }
  if (Result.isInitial(statusResult) || Result.isInitial(profileResult)) {
    return <div className="h-8 animate-pulse rounded bg-muted/40" />
  }
  if (Result.isFailure(statusResult)) {
    return (
      <AsyncView
        result={statusResult}
        contained
        onInitial={() => null}
        onSuccess={() => null}
      />
    )
  }
  if (Result.isFailure(profileResult)) {
    return (
      <AsyncView
        result={profileResult}
        contained
        onInitial={() => null}
        onSuccess={() => null}
      />
    )
  }

  const connected =
    Result.isSuccess(profileResult) && profileResult.value.connected
  if (!connected) {
    return <ConnectEverhourInline />
  }

  return children
}
