import { Plus } from "@pp/ui/icons"
import {
  InputGroup,
  InputGroupAddon,
  InputGroupInput
} from "@pp/ui/input-group"
import { Kbd } from "@pp/ui/kbd"
import { useState } from "react"

const deriveKey = (name: string) =>
  name
    .split(/\s+/)
    .filter(Boolean)
    .map((word) => word[0])
    .join("")
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "")
    .slice(0, 4)

const slugify = (name: string) =>
  name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")

// The new-project field on the projects page: the name is the main input,
// and once it has text a second input for the ticket key (tabular figures) appears
// inside the same field, derived from the name until you edit it. The line
// below previews the first ticket id and the project URL.
export default function ProjectCreator() {
  const [name, setName] = useState("")
  const [customKey, setCustomKey] = useState<string | null>(null)
  const trimmed = name.trim()
  const key = customKey ?? deriveKey(trimmed)

  return (
    <div className="flex w-full max-w-lg flex-col">
      <InputGroup>
        <InputGroupAddon>
          <Plus className="size-4" strokeWidth={1.75} />
        </InputGroupAddon>
        <InputGroupInput
          value={name}
          onChange={(event) => {
            setName(event.target.value)
            if (event.target.value.trim() === "") setCustomKey(null)
          }}
          placeholder="New project name…"
          aria-label="New project name"
          aria-keyshortcuts="c"
          maxLength={120}
        />
        {trimmed ? (
          <div className="flex shrink-0 items-center">
            <div className="mx-1 h-5 w-px bg-border" />
            <input
              value={key}
              onChange={(event) =>
                setCustomKey(
                  event.target.value.toUpperCase().replace(/[^A-Z0-9]/g, "")
                )
              }
              placeholder="KEY"
              aria-label="Ticket key"
              maxLength={10}
              style={{ width: "calc(4ch + 0.5rem)" }}
              className="shrink-0 bg-transparent pr-2 text-body text-foreground tabular-nums outline-none placeholder:text-muted-foreground"
            />
          </div>
        ) : (
          <Kbd aria-hidden>c</Kbd>
        )}
      </InputGroup>
      <div
        aria-hidden={!trimmed}
        className={`mt-2 flex min-w-0 items-center gap-2 pl-3 text-micro text-muted-foreground tabular-nums transition-opacity duration-150 ${trimmed ? "opacity-100" : "opacity-0"}`}
      >
        <span>→</span>
        {key && (
          <>
            <span>{key}-1</span>
            <span>·</span>
          </>
        )}
        <span className="truncate">/{slugify(trimmed) || "project"}</span>
      </div>
    </div>
  )
}
