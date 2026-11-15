import {
  InputGroup,
  InputGroupAddon,
  InputGroupInput
} from "@pp/ui/input-group"
import { Kbd } from "@pp/ui/kbd"
import { cn } from "@pp/ui/lib/utils"
import { Select, SelectTrigger } from "@pp/ui/select"
import { Plus } from "lucide-react"
import { useId, useRef, useState, type FormEvent } from "react"

import {
  CreatorChip,
  SPRINTS,
  SprintGlyph,
  TYPES,
  TypeGlyph,
  sprintItems,
  startsWith,
  typeItems,
  useCreatorFocus,
  useMenuFocus,
  useShortcut,
  waitFrames
} from "./parts/ticket-creator-parts"

// A port of the app's ticket creator (TicketComposer + TicketCreatorShell +
// CreatorMenus + useCreatorFocus) onto @pp/ui parts, with fake data and a
// fake save. Behaviour mirrors the app:
// - at rest the field shows only the type glyph and the sprint glyph, plus
//   the `c` shortcut; press c anywhere on the page to focus it
// - focusing it (or opening one of its menus) expands it: the chips grow a
//   tinted background and their labels slide out, the field's left padding
//   tightens and the "Starts with" line grows in
// - Enter saves: the field locks with a wait cursor, then collapses and
//   clears. A title containing "fail" shows the error instead
// - Escape, a click outside or tabbing away collapses it again

export default function TicketCreator() {
  const inputRef = useRef<HTMLInputElement>(null)
  const formRef = useRef<HTMLFormElement>(null)
  const errorId = useId()
  const { active: expanded, leave } = useCreatorFocus(formRef)
  useShortcut("c", inputRef)

  const [title, setTitle] = useState("")
  const [typeKey, setTypeKey] = useState("bug")
  const [lastUsed, setLastUsed] = useState("bug")
  const [sprintId, setSprintId] = useState("s14")
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const type = TYPES.find((option) => option.key === typeKey) ?? null
  const sprint = SPRINTS.find((option) => option.id === sprintId) ?? null
  const typeFocus = useMenuFocus(inputRef)
  const sprintFocus = useMenuFocus(inputRef)

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const trimmed = title.trim()
    if (!trimmed || busy) return
    inputRef.current?.blur()
    leave()
    setBusy(true)
    setError(null)
    await waitFrames(700)
    setBusy(false)
    if (trimmed.toLowerCase().includes("fail")) {
      setError("Couldn't create the ticket")
      return
    }
    setLastUsed(typeKey)
    setTitle("")
  }

  return (
    <div className="w-full max-w-xl">
      <form
        ref={formRef}
        onSubmit={(event) => void submit(event)}
        data-active={expanded || undefined}
        className="relative"
      >
        <InputGroup
          focused={expanded}
          className={cn(
            "transition-[padding] duration-200 ease-out",
            expanded && "pl-[5px]"
          )}
        >
          <InputGroupAddon className="flex w-auto gap-1">
            <Select
              items={typeItems(lastUsed)}
              value={typeKey}
              onValueChange={(next: string) => setTypeKey(next)}
              onOpenChange={typeFocus.onOpenChange}
              contentProps={{
                align: "start",
                className: "w-56",
                finalFocus: typeFocus.finalFocus
              }}
            >
              <SelectTrigger
                render={
                  <CreatorChip
                    expanded={expanded}
                    icon={<TypeGlyph type={type} />}
                    label={type?.name ?? "No type"}
                    aria-label={`Type: ${type?.name ?? "No type"}`}
                  />
                }
              />
            </Select>
            {type?.key !== "epic" && (
              <Select
                items={sprintItems}
                value={sprintId}
                onValueChange={(next: string) => setSprintId(next)}
                onOpenChange={sprintFocus.onOpenChange}
                contentProps={{
                  align: "start",
                  className: "w-60",
                  finalFocus: sprintFocus.finalFocus
                }}
              >
                <SelectTrigger
                  render={
                    <CreatorChip
                      expanded={expanded}
                      icon={
                        sprint ? (
                          <SprintGlyph sprint={sprint} />
                        ) : (
                          <Plus
                            className="size-4 shrink-0"
                            strokeWidth={1.75}
                          />
                        )
                      }
                      label={sprint ? sprint.name : "Assign sprint"}
                      labelClassName="max-w-[10ch]"
                      aria-label={
                        sprint ? `Sprint: ${sprint.name}` : "Assign sprint"
                      }
                    />
                  }
                />
              </Select>
            )}
          </InputGroupAddon>
          <InputGroupInput
            ref={inputRef}
            value={title}
            onChange={(event) => {
              setTitle(event.target.value)
              setError(null)
            }}
            onKeyDown={(event) => {
              // The selects add hidden inputs, which turns off the browser's
              // implicit submit, so Enter submits by hand (as in the app).
              if (
                event.key !== "Enter" ||
                event.defaultPrevented ||
                event.nativeEvent.isComposing
              )
                return
              event.preventDefault()
              formRef.current?.requestSubmit()
            }}
            placeholder="New ticket title…"
            aria-label="New ticket title"
            aria-keyshortcuts="c"
            aria-invalid={error ? true : undefined}
            aria-describedby={error ? errorId : undefined}
            readOnly={busy}
            aria-disabled={busy || undefined}
            maxLength={200}
            className="read-only:cursor-wait"
          />
          {error ? (
            <span
              id={errorId}
              role="alert"
              className="shrink-0 text-caption text-destructive"
            >
              {error}
            </span>
          ) : (
            !expanded && <Kbd aria-hidden>c</Kbd>
          )}
        </InputGroup>
        {/* In the app this line grows in and pushes the list down. Here the
            example is centred, so it hangs just below the field instead and
            only fades in, leaving the field where it is. */}
        <p
          aria-live="polite"
          aria-hidden={!expanded}
          className={cn(
            "absolute inset-x-0 top-full px-3 pt-1.5 text-caption text-muted-foreground transition-[opacity,translate] duration-200 ease-out",
            expanded
              ? "opacity-100"
              : "pointer-events-none -translate-y-0.5 opacity-0"
          )}
        >
          {startsWith(type)}
        </p>
      </form>
    </div>
  )
}
