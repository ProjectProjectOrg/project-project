import { Check } from "@pp/ui/icons"
import { Input } from "@pp/ui/input"
import { cn } from "@pp/ui/lib/utils"
import { useId, useState } from "react"

// A settings row with a field that saves itself: it commits on blur or Enter,
// Escape puts the saved value back, and a check fades in once it is saved.
// The value is checked first; a bad one stays in the field with an error.
export default function SettingsField() {
  const id = useId()
  const [saved, setSaved] = useState("feat/{key}-{title}")
  const [draft, setDraft] = useState(saved)
  const [error, setError] = useState<string | null>(null)
  const [justSaved, setJustSaved] = useState(false)

  const commit = () => {
    const next = draft.trim()
    if (next === saved) return
    if (!next.includes("{key}")) {
      setError("Include {key}, so a branch finds its ticket")
      return
    }
    setSaved(next)
    setDraft(next)
    setError(null)
    setJustSaved(true)
  }

  return (
    <div className="w-full max-w-lg divide-y divide-border overflow-hidden rounded-lg border border-border surface-card">
      <div className="flex min-h-14 items-center gap-x-4 px-4 py-3">
        <div className="min-w-0 flex-1">
          <p
            id={`${id}-label`}
            className="text-body leading-tight font-semibold"
          >
            Branch name
          </p>
          <p
            id={`${id}-description`}
            className={cn(
              "mt-0.5 text-caption",
              error ? "text-destructive" : "text-muted-foreground"
            )}
          >
            {error ?? "Used when you create a branch from a ticket."}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <Check
            aria-hidden
            className={cn(
              "size-4 text-muted-foreground transition-opacity duration-300",
              justSaved ? "opacity-100" : "opacity-0"
            )}
            strokeWidth={1.75}
          />
          <Input
            size="sm"
            value={draft}
            aria-labelledby={`${id}-label`}
            aria-describedby={`${id}-description`}
            aria-invalid={error ? true : undefined}
            spellCheck={false}
            onChange={(event) => {
              setDraft(event.target.value)
              setJustSaved(false)
            }}
            onBlur={commit}
            onKeyDown={(event) => {
              if (event.key === "Enter") event.currentTarget.blur()
              if (event.key === "Escape") {
                setDraft(saved)
                setError(null)
                event.currentTarget.blur()
              }
            }}
            className="w-48 tabular-nums"
          />
        </div>
      </div>
    </div>
  )
}
