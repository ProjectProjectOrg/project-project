import { Button } from "@pp/ui/button"
import { useState } from "react"

// The countdown on its own. In the app it runs inside Confirm button's
// capsule; hover a button (or the row, marked data-countdown-hold) to hold it.
export default function Countdown() {
  const [run, setRun] = useState(0)
  const [elapsed, setElapsed] = useState<ReadonlyArray<string>>([])
  const onElapsed = (name: string) => () =>
    setElapsed((done) => [...done, name])
  return (
    <div className="flex flex-col items-center gap-4">
      <div data-countdown-hold className="flex items-center gap-2" key={run}>
        <Button
          variant="destructive"
          size="sm"
          countdown={{ seconds: 4, onElapsed: onElapsed("destructive") }}
        >
          Delete
        </Button>
        <Button
          variant="secondary"
          size="sm"
          countdown={{ seconds: 6, onElapsed: onElapsed("secondary") }}
        >
          Keep editing
        </Button>
      </div>
      <div className="flex items-center gap-3">
        <span aria-live="polite" className="text-caption text-muted-foreground">
          {elapsed.length === 0
            ? "Counting down…"
            : `Elapsed: ${elapsed.join(", ")}`}
        </span>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => {
            setElapsed([])
            setRun((n) => n + 1)
          }}
        >
          Restart
        </Button>
      </div>
    </div>
  )
}
