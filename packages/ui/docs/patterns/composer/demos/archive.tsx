import { Button } from "@pp/ui/button"
import { Composer } from "@pp/ui/composer"
import { Archive, Ban, Clock, Copy } from "lucide-react"
import { useState } from "react"

const PRESETS = [
  { label: "Duplicate", icon: Copy },
  { label: "Won't do", icon: Ban },
  { label: "Obsolete", icon: Clock }
] as const

// The ticket page's Archive button (ArchiveForm). The details field is the
// app's own textarea.
export default function ArchiveTicket() {
  const [preset, setPreset] = useState<string | null>(null)
  return (
    <div className="flex w-full items-start justify-center">
      <Composer.Surface>
        <form
          className="flex flex-col"
          onSubmit={(event) => {
            event.preventDefault()
          }}
        >
          <Composer.Header>
            <h2 className="inline-flex items-center gap-1.5 font-normal text-foreground">
              <Archive className="size-3.5" strokeWidth={1.75} />
              Archive
            </h2>
            <span className="tabular-nums">PP-214</span>
          </Composer.Header>
          <Composer.Title className="truncate">
            Fix the login redirect after an expired session
          </Composer.Title>
          <Composer.Body>
            <textarea
              aria-label="Add details… (optional)"
              placeholder="Add details… (optional)"
              className="block field-sizing-content min-h-32 w-full resize-none bg-transparent text-body outline-none placeholder:text-muted-foreground"
            />
          </Composer.Body>
          <Composer.Tray>
            <Composer.Fields>
              {PRESETS.map(({ label, icon: Icon }) => (
                <Button
                  key={label}
                  type="button"
                  variant="ghost"
                  size="sm"
                  aria-pressed={preset === label}
                  onClick={() =>
                    setPreset((current) => (current === label ? null : label))
                  }
                >
                  <Icon className="size-3.5" strokeWidth={1.75} />
                  <span>{label}</span>
                </Button>
              ))}
            </Composer.Fields>
            <Composer.Footer>
              <Composer.Hint>
                Hidden from the backlog and sprints. Find it again with the
                Archived filter.
              </Composer.Hint>
              <Composer.Actions>
                <Button type="button" variant="ghost" size="sm">
                  Cancel
                </Button>
                <Button type="submit" size="sm">
                  Archive
                </Button>
              </Composer.Actions>
            </Composer.Footer>
          </Composer.Tray>
        </form>
      </Composer.Surface>
    </div>
  )
}
