import { Button } from "@pp/ui/button"
import { Circle, CircleCheck, CircleDashed, CircleDot } from "@pp/ui/icons"
import { TextSwap } from "@pp/ui/text-swap"
import { useState, type ReactNode } from "react"

const STATUSES = [
  { label: "Todo", icon: Circle },
  { label: "In progress", icon: CircleDot },
  { label: "In review", icon: CircleDashed },
  { label: "Done", icon: CircleCheck }
] as const

const COUNTS = ["1", "2", "12", "3"] as const

const HINTS = [
  "A day is 8h, a week is 5d.",
  "1 day, 4 hours",
  "2 weeks, 3 days and 6 hours"
] as const

function Cell({
  caption,
  children,
  onNext
}: Readonly<{ caption: string; children: ReactNode; onNext: () => void }>) {
  return (
    <div className="grid w-full min-w-0 content-start justify-items-center gap-3">
      <div className="grid h-10 max-w-full place-items-center">{children}</div>
      <Button variant="secondary" size="xs" onClick={onNext}>
        Next
      </Button>
      <span className="text-center text-caption text-muted-foreground">
        {caption}
      </span>
    </div>
  )
}

// Press Next to change each value. The letters the old and new value share
// stay; the rest roll out and in, and the width eases with them.
export default function Overview() {
  const [status, setStatus] = useState(0)
  const [count, setCount] = useState(0)
  const [hint, setHint] = useState(0)
  const [word, setWord] = useState(false)
  const current = STATUSES[status % STATUSES.length]
  const Icon = current.icon

  return (
    <div className="@container grid w-full content-start gap-10">
      <div className="flex flex-col items-center gap-3 py-2">
        {/* Real display type, not CSS zoom: Scritto measures the zoomed size
            and would overshoot the width three times over, then snap. */}
        <div className="text-display font-semibold">
          <TextSwap
            className="gap-2.5"
            icon={<Icon className="size-8" strokeWidth={1.5} />}
          >
            {current.label}
          </TextSwap>
        </div>
        <Button
          variant="secondary"
          size="sm"
          onClick={() => setStatus((s) => s + 1)}
        >
          Next status
        </Button>
      </div>

      <div className="grid grid-cols-[repeat(2,minmax(0,1fr))] content-start justify-items-center gap-y-8 @xl:grid-cols-[repeat(4,minmax(0,1fr))]">
        <Cell caption="Text" onNext={() => setWord((w) => !w)}>
          <span className="text-body">
            <TextSwap>{word ? "Subscribed" : "Subscribe"}</TextSwap>
          </span>
        </Cell>
        <Cell caption="With an icon" onNext={() => setStatus((s) => s + 1)}>
          <span className="text-body">
            <TextSwap
              className="gap-1.5"
              icon={<Icon className="size-3.5" strokeWidth={1.75} />}
            >
              {current.label}
            </TextSwap>
          </span>
        </Cell>
        <Cell caption="Fast (a count)" onNext={() => setCount((c) => c + 1)}>
          <span className="text-body tabular-nums">
            <TextSwap speed="fast">{COUNTS[count % COUNTS.length]}</TextSwap>
          </span>
        </Cell>
        <Cell
          caption="Announced, wrapping"
          onNext={() => setHint((h) => h + 1)}
        >
          <span className="w-36 text-center text-caption text-muted-foreground">
            <TextSwap announce className="whitespace-normal">
              {HINTS[hint % HINTS.length]}
            </TextSwap>
          </span>
        </Cell>
      </div>
    </div>
  )
}
