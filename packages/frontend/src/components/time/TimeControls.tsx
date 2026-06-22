import { AnimatePresence, motion } from "motion/react"
import { Clock3, Play, Square } from "lucide-react"
import type { WorkTypeOption } from "@projectproject/shared"
import { Button } from "@/components/ui/button"
import { WorkTypeSelect } from "@/components/time/WorkTypeSelect"
import { transitions } from "@/lib/springs"
import * as m from "@/paraglide/messages"

export interface TimeControlsProps {
  value: string
  onValueChange: (value: string) => void
  options: ReadonlyArray<WorkTypeOption>
  running: boolean
  busy: boolean
  onStart: () => void
  onStop: () => void
  logOpen: boolean
  onLogOpenChange: (open: boolean) => void
  children: React.ReactNode
}

export function TimeControls({
  value,
  onValueChange,
  options,
  running,
  busy,
  onStart,
  onStop,
  logOpen,
  onLogOpenChange,
  children
}: TimeControlsProps) {
  return (
    <div className="flex min-w-0 flex-col gap-2.5">
      <div className="flex min-w-0 flex-wrap items-center gap-1.5">
        <div className="min-w-32 flex-1 sm:max-w-52">
          <WorkTypeSelect
            value={value}
            onChange={onValueChange}
            options={options}
            disabled={running || busy}
          />
        </div>
        {running ? (
          <Button
            type="button"
            variant="secondary"
            size="sm"
            leadingIcon={Square}
            loading={busy}
            onClick={onStop}
          >
            {m.time_stop_button()}
          </Button>
        ) : (
          <Button
            type="button"
            size="sm"
            leadingIcon={Play}
            loading={busy}
            onClick={onStart}
          >
            {m.time_start_button()}
          </Button>
        )}
        <Button
          type="button"
          variant="ghost"
          size="sm"
          leadingIcon={Clock3}
          aria-expanded={logOpen}
          onClick={() => onLogOpenChange(!logOpen)}
        >
          {m.time_log_button()}
        </Button>
      </div>
      <AnimatePresence initial={false}>
        {logOpen ? (
          <motion.div
            key="manual-log"
            initial={{ opacity: 0, height: 0, y: -4 }}
            animate={{ opacity: 1, height: "auto", y: 0 }}
            exit={{ opacity: 0, height: 0, y: -4 }}
            transition={transitions.layout}
            className="overflow-hidden"
          >
            <div className="pt-1">{children}</div>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </div>
  )
}
