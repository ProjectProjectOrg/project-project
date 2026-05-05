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
import { cn } from "@/lib/utils"
import type { TicketType } from "@projectproject/shared"

// `focusedClass` mirrors the role-trigger tints from MembersSection — when
// the title input has focus, the type button picks up its type-tone bg so
// the user sees it as a clickable affordance, not just an icon.
const TYPE_META: Record<
  TicketType,
  { label: string; icon: typeof Sparkles; focusedClass: string }
> = {
  feat: {
    label: "Feature",
    icon: Sparkles,
    focusedClass:
      "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 hover:bg-emerald-500/15"
  },
  bug: {
    label: "Bug",
    icon: Bug,
    focusedClass:
      "bg-red-500/10 text-red-700 dark:text-red-400 hover:bg-red-500/15"
  },
  chore: {
    label: "Chore",
    icon: Hammer,
    focusedClass:
      "bg-amber-500/10 text-amber-700 dark:text-amber-400 hover:bg-amber-500/15"
  },
  other: {
    label: "Other",
    icon: HelpCircle,
    focusedClass: "bg-muted text-muted-foreground hover:bg-accent"
  }
}

export function CreateTicketRow({ slug }: { slug: string }) {
  const create = useAtomSet(createTicketAtom)
  const [title, setTitle] = useState("")
  const [type, setType] = useState<TicketType>("other")
  const [submitting, setSubmitting] = useState(false)
  const [focused, setFocused] = useState(false)
  const [menuOpen, setMenuOpen] = useState(false)
  // Bridges the gap between menu close and focus-restore so `expanded`
  // stays true through the handoff.
  const [closingMenu, setClosingMenu] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  useGlobalShortcut("c", inputRef)
  const trimmed = title.trim()
  const expanded = focused || menuOpen || closingMenu

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

  const Icon = TYPE_META[type].icon
  return (
    <form onSubmit={onSubmit} data-active={expanded || undefined}>
      <InputGroup
        className={cn(
          "transition-[padding] duration-200 ease-out",
          expanded && "pl-2"
        )}
      >
        {/* Always `w-auto` so the CollapsingLabel inside can animate its
            width on enter/exit without the addon snapping back to size-6
            mid-animation. */}
        <InputGroupAddon className="w-auto">
          <DropdownMenu
            open={menuOpen}
            onOpenChange={(open) => {
              setMenuOpen(open)
              if (!open) setClosingMenu(true)
            }}
          >
            <DropdownMenuTrigger asChild>
              <button
                type="button"
                aria-label={`Type: ${TYPE_META[type].label}. Click to change.`}
                className={cn(
                  "inline-flex h-6 items-center gap-1.5 rounded-md transition-[padding,background-color,color] duration-200 ease-out hover:bg-accent hover:text-foreground",
                  expanded ? "px-2" : "px-1",
                  expanded && TYPE_META[type].focusedClass
                )}
              >
                <Icon className="size-4 shrink-0" strokeWidth={1.75} />
                <CollapsingLabel show={expanded}>
                  <span className="text-xs">{TYPE_META[type].label}</span>
                </CollapsingLabel>
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent
              align="start"
              sideOffset={6}
              className="w-40"
              // Redirect Radix's default focus-restore (which goes back to
              // the trigger button) to the title input — the dropdown is a
              // sub-task of "writing a ticket" so focus belongs there next.
              // Covers selection, escape, and outside-click closes alike.
              onCloseAutoFocus={(e) => {
                e.preventDefault()
                inputRef.current?.focus()
                setClosingMenu(false)
              }}
            >
              {(Object.keys(TYPE_META) as TicketType[]).map((t) => {
                const TIcon = TYPE_META[t].icon
                return (
                  <DropdownMenuItem
                    key={t}
                    onSelect={() => setType(t)}
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
        {!expanded && !error && <Kbd>c</Kbd>}
      </InputGroup>
    </form>
  )
}
