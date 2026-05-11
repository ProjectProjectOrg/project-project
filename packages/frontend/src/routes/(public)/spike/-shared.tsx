import { useEffect, useRef, useState } from "react"
import { motion } from "motion/react"

export type SpikeStatus =
  | "backlog"
  | "todo"
  | "in_progress"
  | "in_review"
  | "done"

export const SPIKE_STATUSES: SpikeStatus[] = [
  "backlog",
  "todo",
  "in_progress",
  "in_review",
  "done"
]

export const STATUS_LABEL: Record<SpikeStatus, string> = {
  backlog: "Backlog",
  todo: "Todo",
  in_progress: "In progress",
  in_review: "In review",
  done: "Done"
}

export type SpikeTicket = {
  id: string
  title: string
  status: SpikeStatus
  position: number
  priority: "low" | "medium" | "high" | "urgent"
  assignee: string
}

const TITLES = [
  "Refactor router boundary",
  "Add focus ring tokens",
  "Wire optimistic delete",
  "Fix paraglide compile race",
  "Ship sprint breadcrumb",
  "Migrate Radix -> Base UI",
  "Polish empty states",
  "Tighten card spacing",
  "Add fractional position",
  "Investigate FPS dip",
  "Tune transition curves",
  "Compress avatar stack",
  "Expand keyboard nav",
  "Reduce paint regions",
  "Memoize sortable items"
]

const PRIORITIES: SpikeTicket["priority"][] = [
  "low",
  "medium",
  "high",
  "urgent"
]

const ASSIGNEES = ["WM", "AJ", "RK", "TL", "SP", "NV"]

export function generateTickets(count: number): SpikeTicket[] {
  return Array.from({ length: count }, (_, i) => ({
    id: `t-${i}`,
    title: `${TITLES[i % TITLES.length]} #${i + 1}`,
    status: SPIKE_STATUSES[i % SPIKE_STATUSES.length],
    position: i,
    priority: PRIORITIES[i % PRIORITIES.length],
    assignee: ASSIGNEES[i % ASSIGNEES.length]
  }))
}

export function groupByStatus(
  tickets: SpikeTicket[]
): Record<SpikeStatus, SpikeTicket[]> {
  const out: Record<SpikeStatus, SpikeTicket[]> = {
    backlog: [],
    todo: [],
    in_progress: [],
    in_review: [],
    done: []
  }
  for (const t of tickets) out[t.status].push(t)
  for (const s of SPIKE_STATUSES) out[s].sort((a, b) => a.position - b.position)
  return out
}

const PRIORITY_DOT: Record<SpikeTicket["priority"], string> = {
  low: "bg-muted-foreground/30",
  medium: "bg-muted-foreground/50",
  high: "bg-foreground/70",
  urgent: "bg-foreground"
}

export function SpikeCard({
  ticket,
  dragging,
  flashKey
}: {
  ticket: SpikeTicket
  dragging?: boolean
  flashKey?: number
}) {
  return (
    <motion.div
      key={flashKey}
      initial={flashKey ? { boxShadow: "0 0 0 2px rgb(99 102 241 / 0.7)" } : false}
      animate={{ boxShadow: "0 0 0 0px rgb(99 102 241 / 0)" }}
      transition={{ duration: 0.6, ease: "easeOut" }}
      className={`rounded-lg border border-border bg-background p-3 select-none ${
        dragging ? "opacity-40" : ""
      }`}
    >
      <div className="flex items-start gap-2">
        <span
          className={`mt-1.5 inline-block size-2 shrink-0 rounded-full ${PRIORITY_DOT[ticket.priority]}`}
        />
        <p className="flex-1 text-sm leading-snug text-foreground">
          {ticket.title}
        </p>
      </div>
      <div className="mt-3 flex items-center justify-between">
        <span className="text-[11px] text-muted-foreground">{ticket.id}</span>
        <span className="grid size-6 place-items-center rounded-full bg-muted text-[10px] font-medium text-foreground">
          {ticket.assignee}
        </span>
      </div>
    </motion.div>
  )
}

export function PerfOverlay({
  cardCount,
  setCardCount
}: {
  cardCount: number
  setCardCount: (n: number) => void
}) {
  const fps = useFps()
  return (
    <div className="pointer-events-auto fixed bottom-4 right-4 z-50 flex flex-col gap-2 rounded-lg border border-border bg-background/90 px-3 py-2 text-xs shadow-md backdrop-blur">
      <div className="flex items-center gap-3">
        <span className="text-muted-foreground">FPS</span>
        <span
          className={`font-mono tabular-nums ${
            fps < 30 ? "text-red-500" : fps < 50 ? "text-amber-500" : "text-emerald-500"
          }`}
        >
          {fps.toString().padStart(3, " ")}
        </span>
      </div>
      <label className="flex items-center gap-2">
        <span className="text-muted-foreground">Cards</span>
        <input
          type="range"
          min={20}
          max={500}
          step={20}
          value={cardCount}
          onChange={(e) => setCardCount(Number(e.target.value))}
          className="w-32"
        />
        <span className="w-10 text-right font-mono tabular-nums">{cardCount}</span>
      </label>
    </div>
  )
}

function useFps() {
  const [fps, setFps] = useState(60)
  useEffect(() => {
    let raf = 0
    let frames = 0
    let last = performance.now()
    const tick = () => {
      frames++
      const now = performance.now()
      if (now - last >= 500) {
        setFps(Math.round((frames * 1000) / (now - last)))
        frames = 0
        last = now
      }
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [])
  return fps
}

export function useFlashOnLand() {
  const flashRef = useRef<Record<string, number>>({})
  const flash = (id: string) => {
    flashRef.current[id] = (flashRef.current[id] ?? 0) + 1
  }
  const flashKey = (id: string) => flashRef.current[id]
  return { flash, flashKey }
}

export const BOARD_FRAME_CLASS =
  "flex h-[calc(100vh-7rem)] gap-3 overflow-x-auto px-4 pb-4"

export const COLUMN_FRAME_CLASS =
  "flex h-full w-72 shrink-0 flex-col rounded-xl border border-border bg-muted/30"

export const COLUMN_HEADER_CLASS =
  "flex items-center justify-between px-3 py-2 text-xs font-medium text-muted-foreground"

export const COLUMN_LIST_CLASS = "flex flex-1 flex-col overflow-y-auto py-2"
