// Inline ticket creation row. Same UX shape as the "create project" row on
// the projects index — type a title, press Enter, the row clears and the new
// ticket appears in the list above. No modal dialog.
//
// Type defaults to "other"; the user can switch via the leading icon menu
// before pressing Enter. Once submitted, the ticket exists with that type
// (changeable later from the detail page).

import { useAtomSet } from "@effect-atom/atom-react"
import { useState, type FormEvent } from "react"
import { Bug, Hammer, HelpCircle, Sparkles } from "lucide-react"
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
import { createTicketAtom } from "@/atoms/tickets"
import type { TicketType } from "@projectproject/shared"

const TYPE_META: Record<
  TicketType,
  { label: string; icon: typeof Sparkles }
> = {
  feat: { label: "Feature", icon: Sparkles },
  bug: { label: "Bug", icon: Bug },
  chore: { label: "Chore", icon: Hammer },
  other: { label: "Other", icon: HelpCircle }
}

export function CreateTicketRow({
  slug,
  onFocusChange
}: {
  slug: string
  onFocusChange?: (focused: boolean) => void
}) {
  const create = useAtomSet(createTicketAtom)
  const [title, setTitle] = useState("")
  const [type, setType] = useState<TicketType>("other")
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
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

  const Icon = TYPE_META[type].icon
  return (
    <form onSubmit={onSubmit}>
      <InputGroup>
        {/* Leading addon — same size-6 slot every input across the app uses,
            so the type button column-aligns with the search icon, the
            create-project Plus, and ticket-row status circles. */}
        <InputGroupAddon className="hover:text-foreground">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                type="button"
                aria-label={`Type: ${TYPE_META[type].label}. Click to change.`}
                className="grid size-6 place-items-center rounded-md transition-colors hover:bg-accent hover:text-foreground"
              >
                <Icon className="size-4" strokeWidth={1.75} />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" sideOffset={6} className="w-40">
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
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          onFocus={() => onFocusChange?.(true)}
          onBlur={() => onFocusChange?.(false)}
          placeholder="New ticket title…"
          aria-label="New ticket title"
          disabled={submitting}
          maxLength={200}
        />
        {error && (
          <span className="shrink-0 text-xs text-destructive">{error}</span>
        )}
      </InputGroup>
    </form>
  )
}
