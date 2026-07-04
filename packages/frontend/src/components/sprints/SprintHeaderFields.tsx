import { useAtomSet, useAtomValue, Result } from "@effect-atom/atom-react"
import { useNavigate } from "@tanstack/react-router"
import * as DateTime from "effect/DateTime"
import * as Exit from "effect/Exit"
import { MoreHorizontal, RotateCcw, Trash2, Trophy } from "lucide-react"
import { useEffect, useState, type KeyboardEvent } from "react"
import type { DateRange } from "react-day-picker"
import { Calendar } from "@/components/ui/calendar"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger
} from "@/components/ui/dropdown-menu"
import {
  Popover,
  PopoverContent,
  PopoverTrigger
} from "@/components/ui/popover"
import { Hitbox } from "@/components/ui/hitbox"
import { cn } from "@/lib/utils"
import { m } from "@/paraglide/messages"
import { getLocale } from "@/paraglide/runtime"
import {
  completeSprintAtom,
  deleteSprintAtom,
  projectKey,
  updateSprintAtom,
  type CompleteSprintDestination
} from "@/atoms/sprints"
import { ticketsInSprintAtom, ticketsInSprintKey } from "@/atoms/tickets"
import {
  daysLeft,
  pickEarliestPlannedSprint,
  sprintState,
  type Group,
  type GroupId,
  type TicketId
} from "@projectproject/shared"
import { SprintStateIcon } from "./SprintChip"

const shortDateFormatter = () =>
  new Intl.DateTimeFormat(getLocale(), {
    month: "short",
    day: "numeric"
  })

export function SprintStatusSelect({
  orgSlug,
  slug,
  sprint,
  sprints
}: {
  orgSlug: string
  slug: string
  sprint: Group
  sprints: ReadonlyArray<Group>
}) {
  const key = projectKey(orgSlug, slug)
  const complete = useAtomSet(completeSprintAtom(key))
  const reopen = useAtomSet(updateSprintAtom(key))
  const isCompleted = sprint.completedAt !== null
  const planned = pickEarliestPlannedSprint(sprints)

  const ticketsResult = useAtomValue(
    ticketsInSprintAtom(ticketsInSprintKey(orgSlug, slug, sprint.id))
  )
  const ticketStatuses = new Map<TicketId, string>()
  if (Result.isSuccess(ticketsResult)) {
    for (const t of ticketsResult.value) ticketStatuses.set(t.id, t.status)
  }

  const completeTo = (destination: CompleteSprintDestination) =>
    complete({ groupId: sprint.id, destination, ticketStatuses })

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <Hitbox
            mode="inline"
            margin="1"
            aria-label={m.sprints_status_aria_label()}
          >
            <span className="-mt-1 grid size-10 place-items-center rounded-lg bg-muted transition-colors group-hover/hitbox:bg-foreground/5">
              <SprintStateIcon sprint={sprint} size="lg" />
            </span>
          </Hitbox>
        }
      />
      <DropdownMenuContent align="start" sideOffset={8} className="w-56">
        {isCompleted ? (
          <DropdownMenuItem
            onClick={() =>
              reopen({ groupId: sprint.id, patch: { completedAt: null } })
            }
            className="cursor-pointer"
          >
            <RotateCcw className="size-4" strokeWidth={1.75} />
            {m.sprints_reopen_button()}
          </DropdownMenuItem>
        ) : planned ? (
          <>
            <DropdownMenuItem
              onClick={() =>
                completeTo({ kind: "sprint", groupId: planned.id })
              }
              className="cursor-pointer"
            >
              <Trophy
                className="size-4 text-state-success"
                strokeWidth={1.75}
              />
              {m.sprints_complete_to_planned({ name: planned.name })}
            </DropdownMenuItem>
            <DropdownMenuItem
              onClick={() => completeTo({ kind: "backlog" })}
              className="cursor-pointer"
            >
              <Trophy
                className="size-4 text-state-success"
                strokeWidth={1.75}
              />
              {m.sprints_complete_to_backlog()}
            </DropdownMenuItem>
          </>
        ) : (
          <DropdownMenuItem
            onClick={() => completeTo({ kind: "backlog" })}
            className="cursor-pointer"
          >
            <Trophy className="size-4 text-state-success" strokeWidth={1.75} />
            {m.sprints_complete_button()}
          </DropdownMenuItem>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

export function SprintNameField({
  orgSlug,
  slug,
  sprint,
  disabled
}: {
  orgSlug: string
  slug: string
  sprint: Group
  disabled: boolean
}) {
  const key = projectKey(orgSlug, slug)
  const update = useAtomSet(updateSprintAtom(key), { mode: "promiseExit" })
  const updateState = useAtomValue(updateSprintAtom(key))
  const saving = updateState.waiting
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(sprint.name)

  useEffect(() => {
    if (!editing) setDraft(sprint.name)
  }, [editing, sprint.name])

  async function commit() {
    const trimmed = draft.trim()
    if (!trimmed || trimmed === sprint.name) {
      setEditing(false)
      setDraft(sprint.name)
      return
    }
    await update({ groupId: sprint.id, patch: { name: trimmed } })
    setEditing(false)
  }

  function handleKey(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter") {
      e.preventDefault()
      void commit()
    } else if (e.key === "Escape") {
      e.preventDefault()
      setDraft(sprint.name)
      setEditing(false)
    }
  }

  if (disabled || !editing) {
    return (
      <button
        type="button"
        onClick={() => !disabled && setEditing(true)}
        disabled={disabled}
        className={cn(
          "-mx-1 truncate rounded px-1 text-left text-2xl font-semibold tracking-tight transition-colors",
          !disabled && "hover:bg-accent/40"
        )}
      >
        {sprint.name}
      </button>
    )
  }
  return (
    <input
      autoFocus
      value={draft}
      disabled={saving}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={() => void commit()}
      onKeyDown={handleKey}
      className="-mx-1 w-full rounded bg-transparent px-1 text-2xl font-semibold tracking-tight outline-none ring-2 ring-ring/50"
      maxLength={120}
    />
  )
}

export function SprintSubtitle({
  orgSlug,
  slug,
  sprint,
  disabled
}: {
  orgSlug: string
  slug: string
  sprint: Group
  disabled: boolean
}) {
  const state = sprintState(sprint)
  const left = daysLeft(sprint.endsAt)
  return (
    <div className="flex items-center gap-2 text-xs text-muted-foreground">
      <SprintDatesField
        orgSlug={orgSlug}
        slug={slug}
        sprint={sprint}
        disabled={disabled}
      />
      {state === "active" && left !== null && left >= 0 && (
        <span className="font-mono tabular-nums">
          {m.sprints_active_with_days_left({ days: left })}
        </span>
      )}
      {state === "active" && left !== null && left < 0 && (
        <span className="font-mono tabular-nums text-foreground">
          {m.sprints_overdue_with_days({ days: -left })}
        </span>
      )}
      {state === "completed" && sprint.completedAt && (
        <span className="font-mono tabular-nums">
          {m.sprints_completed_at({
            date: shortDateFormatter().format(sprint.completedAt)
          })}
        </span>
      )}
    </div>
  )
}

function SprintDatesField({
  orgSlug,
  slug,
  sprint,
  disabled
}: {
  orgSlug: string
  slug: string
  sprint: Group
  disabled: boolean
}) {
  const key = projectKey(orgSlug, slug)
  const update = useAtomSet(updateSprintAtom(key))
  const [open, setOpen] = useState(false)
  const [draft, setDraft] = useState<DateRange>({
    from: sprint.startsAt ?? undefined,
    to: sprint.endsAt ?? undefined
  })

  useEffect(() => {
    if (!open) {
      setDraft({
        from: sprint.startsAt ?? undefined,
        to: sprint.endsAt ?? undefined
      })
    }
  }, [open, sprint.startsAt, sprint.endsAt])

  const fmt = shortDateFormatter()
  const label =
    sprint.startsAt && sprint.endsAt
      ? `${fmt.format(sprint.startsAt)} – ${fmt.format(sprint.endsAt)}`
      : m.sprints_date_range_label()

  if (disabled) {
    return <span className="font-mono tabular-nums">{label}</span>
  }
  return (
    <Popover
      open={open}
      onOpenChange={(next) => {
        setOpen(next)
        if (!next) {
          const nextStart = draft.from ?? null
          const nextEnd = draft.to ?? null
          const prevStart = sprint.startsAt ?? null
          const prevEnd = sprint.endsAt ?? null
          if (
            nextStart?.getTime() !== prevStart?.getTime() ||
            nextEnd?.getTime() !== prevEnd?.getTime()
          ) {
            update({
              groupId: sprint.id,
              patch: { startsAt: nextStart, endsAt: nextEnd }
            })
          }
        }
      }}
    >
      <PopoverTrigger
        render={
          <button
            type="button"
            className="-mx-1 rounded px-1 font-mono tabular-nums transition-colors transition-transform duration-100 hover:bg-accent/40 hover:text-foreground active:scale-[0.97]"
          >
            {label}
          </button>
        }
      />
      <PopoverContent align="start" className="w-auto p-0">
        <Calendar
          mode="range"
          selected={draft}
          onSelect={(r) => setDraft(r ?? { from: undefined, to: undefined })}
          numberOfMonths={1}
          defaultMonth={draft.from ?? DateTime.toDate(DateTime.unsafeNow())}
        />
      </PopoverContent>
    </Popover>
  )
}

export function SprintDeleteMenu({
  orgSlug,
  slug,
  sprint
}: {
  orgSlug: string
  slug: string
  sprint: Group
}) {
  const navigate = useNavigate()
  const key = projectKey(orgSlug, slug)
  const remove = useAtomSet(deleteSprintAtom(key), { mode: "promiseExit" })
  const removeState = useAtomValue(deleteSprintAtom(key))
  const deleting = removeState.waiting
  const [confirming, setConfirming] = useState(false)

  async function onDelete(groupId: GroupId) {
    const exit = await remove({ groupId })
    if (Exit.isSuccess(exit)) {
      void navigate({
        to: "/orgs/$orgSlug/projects/$slug/sprints",
        params: { orgSlug, slug }
      })
    }
  }

  return (
    <DropdownMenu onOpenChange={(open) => !open && setConfirming(false)}>
      <DropdownMenuTrigger
        render={
          <button
            type="button"
            aria-label={m.sprints_actions_aria_label()}
            className="grid size-8 shrink-0 place-items-center rounded-md text-muted-foreground outline-none transition-colors transition-transform duration-100 hover:bg-accent hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring active:scale-[0.97]"
          >
            <MoreHorizontal className="size-4" strokeWidth={1.75} />
          </button>
        }
      />
      <DropdownMenuContent align="end" sideOffset={6} className="w-56">
        {!confirming ? (
          <DropdownMenuItem
            closeOnClick={false}
            onClick={() => setConfirming(true)}
            className="cursor-pointer text-destructive focus:text-destructive"
          >
            <Trash2 className="size-4" strokeWidth={1.75} />
            {m.sprints_delete_button()}
          </DropdownMenuItem>
        ) : (
          <div className="flex flex-col gap-2 p-1">
            <p className="px-2 pt-1 text-xs text-muted-foreground">
              {m.sprints_delete_confirm_prompt()}
            </p>
            <div className="flex gap-1 px-1 pb-1">
              <button
                type="button"
                disabled={deleting}
                onClick={() => void onDelete(sprint.id)}
                className="flex-1 rounded-md bg-destructive px-2 py-1 text-xs font-medium text-destructive-foreground transition-colors hover:bg-destructive/90 disabled:opacity-50"
              >
                {m.common_delete_confirm_button()}
              </button>
              <button
                type="button"
                disabled={deleting}
                onClick={() => setConfirming(false)}
                className="rounded-md px-2 py-1 text-xs text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
              >
                {m.common_cancel_button()}
              </button>
            </div>
          </div>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
