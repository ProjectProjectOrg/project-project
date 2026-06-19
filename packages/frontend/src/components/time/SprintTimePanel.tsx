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
import { WorkTypeSelect } from "@/components/time/WorkTypeSelect"
import { Button } from "@/components/ui/button"
import * as m from "@/paraglide/messages"

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
    <div className="flex flex-col gap-3 rounded-xl border border-border/60 p-3">
      <div className="flex items-center gap-2">
        <WorkTypeSelect
          value={workType}
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
            onClick={() => void start({ workTypeKey: workType })}
          >
            {m.time_start_button()}
          </Button>
        )}
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={() => setShowLog((value) => !value)}
        >
          {m.time_log_button()}
        </Button>
      </div>
      {showLog ? (
        <LogTimeForm
          orgSlug={orgSlug}
          slug={slug}
          ticketId={null}
          groupId={groupId}
          options={options}
          defaultWorkType={workType}
          onDone={() => setShowLog(false)}
        />
      ) : null}
    </div>
  )
}
