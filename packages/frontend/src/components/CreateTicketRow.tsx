import {
  Result,
  useAtomRefresh,
  useAtomSet,
  useAtomValue
} from "@effect-atom/atom-react"
import { useNavigate } from "@tanstack/react-router"
import { Exit } from "effect"
import { useRef, useState, type FormEvent } from "react"
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
import { BADGE_TONES } from "@/components/ui/badge"
import { Kbd } from "@/components/ui/kbd"
import { projectGitStatesBaseAtom } from "@/atoms/github"
import { projectKey } from "@/atoms/projects"
import { createTicketAtom } from "@/atoms/tickets"
import { ticketWriteKeys } from "@/atoms/reactivity-keys"
import { useGlobalShortcut } from "@/lib/use-global-shortcut"
import { cn } from "@/lib/utils"
import { TYPE_LABELS, TYPE_META } from "@/lib/ticket-meta"
import { m } from "@/paraglide/messages"
import type { TicketType } from "@projectproject/shared"

export function CreateTicketRow({
  orgSlug,
  slug
}: {
  orgSlug: string
  slug: string
}) {
  const projKey = projectKey(orgSlug, slug)
  const create = useAtomSet(createTicketAtom, { mode: "promiseExit" })
  const createState = useAtomValue(createTicketAtom)
  const submitting = createState.waiting
  const error = Result.isFailure(createState)
    ? m.tickets_create_error_fallback()
    : null
  const refreshGitStates = useAtomRefresh(projectGitStatesBaseAtom(projKey))
  const navigate = useNavigate()
  const [title, setTitle] = useState("")
  const [type, setType] = useState<TicketType>("other")
  const [focused, setFocused] = useState(false)
  const [menuOpen, setMenuOpen] = useState(false)
  const [closingMenu, setClosingMenu] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)
  useGlobalShortcut("c", inputRef)
  const trimmed = title.trim()
  const expanded = focused || menuOpen || closingMenu

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    if (!trimmed || submitting) return
    inputRef.current?.blur()
    setFocused(false)
    const exit = await create({
      path: { orgSlug, slug },
      payload: { title: trimmed, type },
      reactivityKeys: ticketWriteKeys
    })
    if (Exit.isSuccess(exit)) {
      const ticket = exit.value
      setTitle("")
      refreshGitStates()
      navigate({
        to: ".",
        search: (prev) => ({
          ...(prev as object),
          ticket: ticket.id,
          focusBody: 1
        }),
        replace: true
      })
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
                aria-label={m.tickets_create_type_aria_label({
                  type: TYPE_LABELS[type]()
                })}
                className={cn(
                  "inline-flex h-6 items-center gap-1.5 rounded-md transition-expand",
                  expanded
                    ? cn("px-2", BADGE_TONES[TYPE_META[type].tone])
                    : "px-1 hover:bg-accent hover:text-foreground"
                )}
              >
                <Icon className="size-4 shrink-0" strokeWidth={1.75} />
                <CollapsingLabel show={expanded}>
                  <span className="text-xs">{TYPE_LABELS[type]()}</span>
                </CollapsingLabel>
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent
              align="start"
              sideOffset={6}
              className="w-40"
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
                    {TYPE_LABELS[t]()}
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
          placeholder={m.tickets_create_title_placeholder()}
          aria-label={m.tickets_create_title_aria_label()}
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
