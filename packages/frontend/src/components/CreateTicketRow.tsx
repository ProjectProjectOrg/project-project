// Inline ticket creation row. Same UX shape as the "create project" row on
// the projects index — type a title, press Enter, the row clears and the new
// ticket appears in the list above. No modal dialog.
//
// Type defaults to "other"; the user can switch via the leading icon menu
// before pressing Enter. Once submitted, the ticket exists with that type
// (changeable later from the detail page).
//
// Affordances layered on:
//   - When the user picks a type from the dropdown, focus jumps to the title
//     input so they can start typing immediately.
//   - The type button reveals its label inline while the input is focused
//     (CollapsingLabel) — calmer than a static label, clearer than icon-only
//     once the user is in the row's intent.
//   - A `c` Kbd hint sits at the trailing edge of the input. The matching
//     global shortcut focuses the input from anywhere. Hidden while focused
//     so it doesn't compete with the caret.

import { useAtomSet } from "@effect-atom/atom-react"
import { useRef, useState, type FormEvent } from "react"
import { Bug, Hammer, HelpCircle, Sparkles } from "lucide-react"
import { CollapsingLabel } from "@/components/SegmentedTabs"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger
} from "@/components/ui/dropdown-menu"
import {
  InputGroup,
  InputGroupAddon,
  InputGroupInput
} from "@/components/ui/input-group"
import { Kbd } from "@/components/ui/kbd"
import { createTicketAtom } from "@/atoms/tickets"
import { useGlobalShortcut } from "@/lib/use-global-shortcut"
import type { TicketType } from "@projectproject/shared"

const TYPE_META: Record<TicketType, { label: string; icon: typeof Sparkles }> =
  {
    feat: { label: "Feature", icon: Sparkles },
    bug: { label: "Bug", icon: Bug },
    chore: { label: "Chore", icon: Hammer },
    other: { label: "Other", icon: HelpCircle }
  }

export function CreateTicketRow({ slug }: { slug: string }) {
  const create = useAtomSet(createTicketAtom)
  const [title, setTitle] = useState("")
  const [type, setType] = useState<TicketType>("other")
  const [submitting, setSubmitting] = useState(false)
  const [focused, setFocused] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  useGlobalShortcut("c", inputRef)
  const trimmed = title.trim()

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    if (!trimmed || submitting) return
    setSubmitting(true)
    setError(null)
    try {
      await create({ slug, title: trimmed, type })
      setTitle("")
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create ticket")
    } finally {
      setSubmitting(false)
    }
  }

  // After the dropdown closes, push focus into the title input so the user
  // can keep typing without a stray click. requestAnimationFrame waits for
  // Radix's focus-restore on close — focusing inside `onSelect` would lose
  // the race and Radix would yank focus back to the menu trigger.
  function selectType(next: TicketType) {
    setType(next)
    requestAnimationFrame(() => inputRef.current?.focus())
  }

  const Icon = TYPE_META[type].icon
  return (
    <form onSubmit={onSubmit}>
      <InputGroup>
        {/* Leading addon — same size-6 slot every input across the app uses,
            so the type button column-aligns with the search icon, the
            create-project Plus, and ticket-row status circles. The addon
            itself widens to fit the inline label when revealed. */}
        <InputGroupAddon
          className={focused ? "w-auto" : undefined}
        >
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                type="button"
                aria-label={`Type: ${TYPE_META[type].label}. Click to change.`}
                className="inline-flex h-6 items-center gap-1.5 rounded-md px-1 transition-colors hover:bg-accent hover:text-foreground"
              >
                <Icon className="size-4 shrink-0" strokeWidth={1.75} />
                <CollapsingLabel show={focused}>
                  <span className="text-xs">{TYPE_META[type].label}</span>
                </CollapsingLabel>
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" sideOffset={6} className="w-40">
              {(Object.keys(TYPE_META) as TicketType[]).map((t) => {
                const TIcon = TYPE_META[t].icon
                return (
                  <DropdownMenuItem
                    key={t}
                    onSelect={() => selectType(t)}
                    className="cursor-pointer"
                  >
                    <TIcon className="size-4" strokeWidth={1.75} />
                    {TYPE_META[t].label}
                  </DropdownMenuItem>
                )
              })}
            </DropdownMenuContent>
          </DropdownMenu>
        </InputGroupAddon>
        <InputGroupInput
          ref={inputRef}
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          placeholder="New ticket title…"
          aria-label="New ticket title"
          disabled={submitting}
          maxLength={200}
        />
        {error && (
          <span className="shrink-0 text-xs text-destructive">{error}</span>
        )}
        {!focused && !error && <Kbd>c</Kbd>}
      </InputGroup>
    </form>
  )
}
