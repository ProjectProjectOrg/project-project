import { Result, useAtomSet, useAtomValue } from "@effect-atom/atom-react"
import { useState } from "react"
import { DEFAULT_WORK_TYPES, type GroupId } from "@projectproject/shared"
import { everhourProfileAtom } from "@/atoms/everhour"
import {
  activeTimerAtom,
  groupKey,
  startSprintTimerAtom,
  stopTimerAtom
} from "@/atoms/timeTracking"
import { ConnectEverhourInline } from "@/components/time/ConnectEverhourInline"
import { LogTimeForm } from "@/components/time/LogTimeForm"
import { TimeControls } from "@/components/time/TimeControls"

const options = DEFAULT_WORK_TYPES.map((workType) => ({
  key: workType.key,
  label: workType.label
}))

export function SprintTimePanel({
  orgSlug,
  slug,
  groupId
}: {
  orgSlug: string
  slug: string
  groupId: GroupId
}) {
  const gKey = groupKey(orgSlug, slug, groupId)
  const profileResult = useAtomValue(everhourProfileAtom)
  const activeTimerResult = useAtomValue(activeTimerAtom(orgSlug))
  const start = useAtomSet(startSprintTimerAtom(gKey), { mode: "promiseExit" })
  const startState = useAtomValue(startSprintTimerAtom(gKey))
  const stop = useAtomSet(stopTimerAtom(orgSlug), { mode: "promiseExit" })
  const stopState = useAtomValue(stopTimerAtom(orgSlug))
  const [workType, setWorkType] = useState(options[0].key)
  const [showLog, setShowLog] = useState(false)

  const connected =
    Result.isSuccess(profileResult) && profileResult.value.connected
  if (!connected) {
    return <ConnectEverhourInline />
  }

  const running =
    Result.isSuccess(activeTimerResult) &&
    activeTimerResult.value !== null &&
    activeTimerResult.value.ticketId === null &&
    activeTimerResult.value.groupId === groupId
  const busy = startState.waiting || stopState.waiting

  return (
    <div className="flex flex-col gap-2">
      <TimeControls
        value={workType}
        onValueChange={setWorkType}
        options={options}
        running={running}
        busy={busy}
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
  )
}
