import { Checkbox } from "@pp/ui/checkbox"
import { MemberAvatar } from "@pp/ui/member-avatar"
import { SegmentedTabs } from "@pp/ui/segmented-tabs"
import {
  Timeline,
  TimelineEntry,
  TimelineEvent,
  TimelineValue
} from "@pp/ui/timeline"
import { AnimatePresence } from "motion/react"
import { useEffect, useId, useState } from "react"

import { ANA, Ago, BRAM, Bubble, Name } from "./parts/timeline-parts"

const priorities = [
  { key: "low", label: "Low" },
  { key: "high", label: "High" }
] as const

function useSettledValue<T>(value: T) {
  const [saved, setSaved] = useState(value)
  useEffect(() => {
    const timer = window.setTimeout(() => setSaved(value), 350)
    return () => window.clearTimeout(timer)
  }, [value])
  return saved
}

export default function LiveActivity() {
  const [priority, setPriority] = useState<"low" | "high">("low")
  const checkboxId = useId()
  const [checked, setChecked] = useState(false)
  const savedPriority = useSettledValue(priority)
  const savedCheck = useSettledValue(checked)
  const mark = <MemberAvatar member={ANA} size={20} />
  const actor = <Name>{ANA.name}</Name>

  return (
    <article className="mx-auto flex w-full max-w-xl flex-col gap-6 self-start p-4 sm:p-6">
      <header>
        <div className="text-caption text-muted-foreground">WEB-42</div>
        <h2 className="text-title font-semibold">
          Ship the new sign-in screen
        </h2>
      </header>
      <div className="grid gap-3">
        <div className="flex items-center gap-3">
          <span className="text-body text-muted-foreground">Priority</span>
          <SegmentedTabs
            aria-label="Priority"
            items={priorities}
            value={priority}
            onValueChange={setPriority}
          />
        </div>
        <label
          htmlFor={checkboxId}
          className="flex min-h-8 w-fit cursor-pointer items-center gap-2 text-body"
        >
          <Checkbox
            id={checkboxId}
            checked={checked}
            onCheckedChange={setChecked}
          />
          Test sign-in on mobile
        </label>
      </div>
      <section>
        <h3 className="mb-2 text-title-compact">Activity</h3>
        <Timeline>
          <TimelineEvent mark={mark} actor={actor} time={<Ago>Yesterday</Ago>}>
            created this ticket
          </TimelineEvent>
          <TimelineEntry>
            <Bubble member={BRAM} time="Yesterday">
              Desktop looks good. Can you check mobile before we ship?
            </Bubble>
          </TimelineEntry>
          <AnimatePresence initial={false}>
            {savedPriority === "high" && (
              <TimelineEvent
                key="priority"
                appear
                mark={mark}
                actor={actor}
                time={<Ago>Just now</Ago>}
              >
                changed priority from <TimelineValue>Low</TimelineValue> to{" "}
                <TimelineValue>High</TimelineValue>
              </TimelineEvent>
            )}
            {savedCheck && (
              <TimelineEvent
                key="description"
                appear
                mark={mark}
                actor={actor}
                time={<Ago>Just now</Ago>}
              >
                edited the description
              </TimelineEvent>
            )}
          </AnimatePresence>
        </Timeline>
      </section>
    </article>
  )
}
