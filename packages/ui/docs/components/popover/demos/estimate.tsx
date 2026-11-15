import { Button } from "@pp/ui/button"
import { Input } from "@pp/ui/input"
import { Kbd } from "@pp/ui/kbd"
import { blurSwap } from "@pp/ui/lib/springs"
import { Popover, PopoverContent, PopoverTrigger } from "@pp/ui/popover"
import { Timer } from "lucide-react"
import { AnimatePresence, motion } from "motion/react"
import { useId, useState, type FormEvent } from "react"

const USER_TOGGLES = new Set(["trigger-press", "escape-key", "outside-press"])

// A day is 8h and a week is 5d.
const UNIT_MINUTES = new Map([
  ["w", 5 * 8 * 60],
  ["d", 8 * 60],
  ["h", 60],
  ["m", 1]
])

// "2d 4h", "45m", "1w": a day is 8h and a week is 5d, up to 999h.
const parseMinutes = (draft: string): number | null => {
  const parts = draft.trim().toLowerCase().split(/\s+/)
  let total = 0
  for (const part of parts) {
    const match = /^(\d+(?:\.\d+)?)([wdhm])$/.exec(part)
    if (!match) return null
    total += Number(match[1]) * (UNIT_MINUTES.get(match[2] ?? "") ?? 0)
  }
  return total > 0 && total <= 999 * 60 ? Math.round(total) : null
}

const formatLong = (minutes: number) => {
  const hours = Math.floor(minutes / 60)
  const rest = minutes % 60
  const parts = [
    hours > 0 && `${hours} ${hours === 1 ? "hour" : "hours"}`,
    rest > 0 && `${rest} ${rest === 1 ? "minute" : "minutes"}`
  ].filter(Boolean)
  return `${parts.join(" ")} of work`
}

const formatShort = (minutes: number) => {
  const hours = Math.floor(minutes / 60)
  const rest = minutes % 60
  return [hours > 0 && `${hours}h`, rest > 0 && `${rest}m`]
    .filter(Boolean)
    .join(" ")
}

// A ticket row's estimate chip: a small popover with one field, a live
// reading of what you typed, and Clear and Save.
export default function Estimate() {
  const [open, setOpen] = useState(true)
  const [estimate, setEstimate] = useState<number | null>(150)

  return (
    <Popover
      open={open}
      onOpenChange={(next, details) => {
        if (USER_TOGGLES.has(details.reason)) setOpen(next)
      }}
    >
      <PopoverTrigger
        render={<Button variant="ghost" size="sm" tone="strong" />}
      >
        <Timer className="size-3.5" strokeWidth={1.75} />
        {estimate === null ? "Estimate" : formatShort(estimate)}
      </PopoverTrigger>
      <PopoverContent align="start" sideOffset={6} className="w-60">
        <EstimateForm
          initial={estimate === null ? "" : formatShort(estimate)}
          canClear={estimate !== null}
          onSubmit={(next) => {
            setEstimate(next)
            setOpen(false)
          }}
        />
      </PopoverContent>
    </Popover>
  )
}

function EstimateForm({
  initial,
  canClear,
  onSubmit
}: Readonly<{
  initial: string
  canClear: boolean
  onSubmit: (minutes: number | null) => void
}>) {
  const inputId = useId()
  const errorId = useId()
  const [draft, setDraft] = useState(initial)
  const [invalid, setInvalid] = useState(false)
  const parsed = parseMinutes(draft)
  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (parsed === null) {
      setInvalid(true)
      return
    }
    onSubmit(parsed)
  }
  const hint =
    parsed === null ? "A day is 8h, a week is 5d." : formatLong(parsed)
  return (
    <form onSubmit={submit} className="flex flex-col gap-2">
      <label htmlFor={inputId} className="text-caption text-muted-foreground">
        Duration
      </label>
      <Input
        id={inputId}
        value={draft}
        placeholder="2w 4d 6h 45m"
        aria-invalid={invalid}
        aria-describedby={invalid ? errorId : undefined}
        onChange={(event) => {
          setDraft(event.target.value)
          setInvalid(false)
        }}
        size="md"
        className="tabular-nums"
      />
      {invalid ? (
        <p id={errorId} role="alert" className="text-caption text-destructive">
          Try 45m, 3h, 2d 4h or 1w, up to 999h.
        </p>
      ) : (
        <p
          aria-live="polite"
          className="grid text-caption text-muted-foreground tabular-nums"
        >
          <AnimatePresence initial={false}>
            <motion.span
              key={hint}
              variants={blurSwap}
              initial="hidden"
              animate="shown"
              exit="hidden"
              className="col-start-1 row-start-1"
            >
              {hint}
            </motion.span>
          </AnimatePresence>
        </p>
      )}
      <div className="flex items-center justify-end gap-1">
        {canClear && (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => onSubmit(null)}
          >
            Clear
          </Button>
        )}
        <Button type="submit" size="sm" disabled={draft.trim() === ""}>
          Save
          <Kbd
            aria-hidden
            size="sm"
            className="bg-background/15 text-background"
          >
            ↵
          </Kbd>
        </Button>
      </div>
    </form>
  )
}
