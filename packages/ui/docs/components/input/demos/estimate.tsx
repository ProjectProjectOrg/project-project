import { Button } from "@pp/ui/button"
import { Input } from "@pp/ui/input"
import { popupSurfaceClass } from "@pp/ui/menu-styles"
import { useId, useState, type FormEvent } from "react"

const parseMinutes = (text: string) => {
  const match = text
    .trim()
    .toLowerCase()
    .match(/^(?:(\d+(?:\.\d+)?)\s*h)?\s*(?:(\d+)\s*m)?$/)
  if (!match || (match[1] === undefined && match[2] === undefined)) return null
  return Math.round(Number(match[1] ?? 0) * 60 + Number(match[2] ?? 0))
}

const describe = (minutes: number) => {
  const hours = Math.floor(minutes / 60)
  const rest = minutes % 60
  return [
    hours && `${hours} hour${hours === 1 ? "" : "s"}`,
    rest && `${rest} minutes`
  ]
    .filter(Boolean)
    .join(" ")
}

// The time estimate in the ticket's estimate popover: a medium field with
// tabular figures, a live reading of what you typed under it, and an inline
// error that replaces that line when the text can't be read as a duration.
export default function Estimate() {
  const id = useId()
  const [draft, setDraft] = useState("1h 30m")
  const [invalid, setInvalid] = useState(false)
  const minutes = parseMinutes(draft)

  const submit = (event: FormEvent) => {
    event.preventDefault()
    setInvalid(minutes === null || minutes === 0)
  }

  return (
    <form
      onSubmit={submit}
      className={`${popupSurfaceClass} flex w-64 flex-col gap-2 p-3`}
    >
      <label htmlFor={id} className="text-caption text-muted-foreground">
        Time estimate
      </label>
      <Input
        id={id}
        size="md"
        value={draft}
        placeholder="1h 30m"
        aria-invalid={invalid}
        aria-describedby={`${id}-hint`}
        onChange={(event) => {
          setDraft(event.target.value)
          setInvalid(false)
        }}
        className="tabular-nums"
      />
      <p
        id={`${id}-hint`}
        role={invalid ? "alert" : undefined}
        className={`min-h-4 text-caption ${invalid ? "text-destructive" : "text-muted-foreground"}`}
      >
        {invalid
          ? "Use hours and minutes, like 2h or 45m"
          : minutes
            ? describe(minutes)
            : "Hours and minutes, like 1h 30m"}
      </p>
      <div className="flex items-center justify-end gap-1">
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={() => setDraft("")}
        >
          Clear
        </Button>
        <Button type="submit" size="sm">
          Save
        </Button>
      </div>
    </form>
  )
}
