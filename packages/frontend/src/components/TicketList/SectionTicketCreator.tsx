import { Result, useAtomSet, useAtomValue } from "@effect-atom/atom-react"
import * as Exit from "effect/Exit"
import {
  useEffect,
  useRef,
  useState,
  type FormEvent,
  type KeyboardEvent,
  type RefObject
} from "react"
import { CollapsingLabel } from "@/components/SegmentedTabs"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger
} from "@/components/ui/dropdown-menu"
import { BADGE_TONES } from "@/components/ui/badge"
import { meAtom } from "@/atoms/auth"
import {
  quickCreateTicketAtom,
  ticketsListKeyForStatus
} from "@/atoms/tickets"
import { cn } from "@/lib/utils"
import { TYPE_LABELS, TYPE_META } from "@/lib/ticket-meta"
import { m } from "@/paraglide/messages"
import type {
  TicketListQuery,
  TicketStatus,
  TicketType
} from "@projectproject/shared"

export function SectionTicketCreator({
  orgSlug,
  slug,
  status,
  query,
  containerRef,
  onDone
}: {
  orgSlug: string
  slug: string
  status: TicketStatus
  query: TicketListQuery
  containerRef: RefObject<HTMLDivElement | null>
  onDone: () => void
}) {
  const sectionKey = ticketsListKeyForStatus(orgSlug, slug, query, status)
  const create = useAtomSet(quickCreateTicketAtom(sectionKey), {
    mode: "promiseExit"
  })
  const createState = useAtomValue(quickCreateTicketAtom(sectionKey))
  const submitting = createState.waiting
  const error = Result.isFailure(createState)
    ? m.tickets_create_error_fallback()
    : null

  const me = useAtomValue(meAtom)
  const viewerId = Result.isSuccess(me) ? me.value.id : ""

  const [title, setTitle] = useState("")
  const [type, setType] = useState<TicketType>("other")
  const [typeMenuOpen, setTypeMenuOpen] = useState(false)
  const [closingMenu, setClosingMenu] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)
  const trimmed = title.trim()

  useEffect(() => {
    inputRef.current?.focus()
  }, [])

  useEffect(() => {
    const onMouseDown = (e: MouseEvent) => {
      if (typeMenuOpen || closingMenu) return
      const container = containerRef.current
      if (container && !container.contains(e.target as Node)) {
        onDone()
      }
    }
    document.addEventListener("mousedown", onMouseDown)
    return () => document.removeEventListener("mousedown", onMouseDown)
  }, [typeMenuOpen, closingMenu, onDone, containerRef])

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    if (!trimmed || submitting) return
    const exit = await create({
      ticket: { title: trimmed, type, status },
      viewerId
    })
    if (Exit.isSuccess(exit)) {
      setTitle("")
      inputRef.current?.focus()
    }
  }

  function onKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Escape") {
      e.preventDefault()
      onDone()
    }
  }

  const TypeIcon = TYPE_META[type].icon

  return (
    <form
      onSubmit={onSubmit}
      className="flex w-full items-center gap-2"
    >
      <DropdownMenu
        open={typeMenuOpen}
        onOpenChange={(open) => {
          setTypeMenuOpen(open)
          if (!open) {
            setClosingMenu(true)
            // @effect-diagnostics-next-line globalTimers:off
            setTimeout(() => {
              inputRef.current?.focus()
              setClosingMenu(false)
            }, 0)
          }
        }}
      >
        <DropdownMenuTrigger
          render={
            <button
              type="button"
              aria-label={m.tickets_create_type_aria_label({
                type: TYPE_LABELS[type]()
              })}
              className={cn(
                "inline-flex h-6 shrink-0 items-center gap-1.5 rounded-md px-2 transition-expand",
                BADGE_TONES[TYPE_META[type].tone]
              )}
            >
              <TypeIcon className="size-4 shrink-0" strokeWidth={1.75} />
              <CollapsingLabel show contentKey={type}>
                <span className="text-xs">{TYPE_LABELS[type]()}</span>
              </CollapsingLabel>
            </button>
          }
        />
        <DropdownMenuContent
          align="start"
          sideOffset={6}
          className="w-40"
          finalFocus={() => {
            setClosingMenu(false)
            return inputRef.current
          }}
        >
          {(Object.keys(TYPE_META) as TicketType[]).map((t) => {
            const TIcon = TYPE_META[t].icon
            return (
              <DropdownMenuItem
                key={t}
                onClick={() => setType(t)}
                className="cursor-pointer"
              >
                <TIcon className="size-4" strokeWidth={1.75} />
                {TYPE_LABELS[t]()}
              </DropdownMenuItem>
            )
          })}
        </DropdownMenuContent>
      </DropdownMenu>

      <input
        ref={inputRef}
        type="text"
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        onKeyDown={onKeyDown}
        placeholder={m.tickets_section_create_placeholder()}
        aria-label={m.tickets_section_create_placeholder()}
        disabled={submitting}
        maxLength={200}
        className="min-w-0 flex-1 bg-transparent text-sm font-medium text-foreground outline-none placeholder:text-muted-foreground disabled:cursor-not-allowed"
      />

      {error && (
        <span className="shrink-0 text-xs text-destructive">{error}</span>
      )}
    </form>
  )
}
