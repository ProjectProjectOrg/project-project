import { useAtomSet, useAtomValue } from "@effect-atom/atom-react"
import { useNavigate } from "@tanstack/react-router"
import { Exit } from "effect"
import { MoreHorizontal, Trash2, CheckCircle2 } from "lucide-react"
import { useEffect, useState, type KeyboardEvent } from "react"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger
} from "@/components/ui/dropdown-menu"
import { cn } from "@/lib/utils"
import { m } from "@/paraglide/messages"
import {
  deleteSprintAtom,
  projectKey,
  updateSprintAtom
} from "@/atoms/sprints"
import {
  daysLeft,
  sprintState,
  type Group,
  type GroupId
} from "@projectproject/shared"
import { SprintStateDot } from "./SprintChip"

const DATE_FMT = new Intl.DateTimeFormat(undefined, {
  month: "short",
  day: "numeric",
  year: "numeric"
})

function toDateInputValue(d: Date | null): string {
  if (!d) return ""
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`
}
function parseDateInput(value: string): Date {
  const [y, m, d] = value.split("-").map(Number)
  return new Date(y, (m ?? 1) - 1, d ?? 1)
}

export function SprintDetailHeader({
  orgSlug,
  slug,
  sprint,
  onRequestComplete
}: {
  orgSlug: string
  slug: string
  sprint: Group
  onRequestComplete?: () => void
}) {
  const isCompleted = sprint.completedAt !== null
  const left = daysLeft(sprint.endsAt)
  const state = sprintState(sprint)

  return (
    <header className="flex flex-col gap-2 border-b border-border pb-4">
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 flex-1 items-center gap-2">
          <SprintStateDot sprint={sprint} className="size-2" />
          <NameField
            orgSlug={orgSlug}
            slug={slug}
            sprint={sprint}
            disabled={isCompleted}
          />
        </div>
        <SprintMenu
          orgSlug={orgSlug}
          slug={slug}
          sprint={sprint}
          onRequestComplete={onRequestComplete}
        />
      </div>
      <div className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
        <DateRangeField
          orgSlug={orgSlug}
          slug={slug}
          sprint={sprint}
          disabled={isCompleted}
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
          <span>
            {m.sprints_completed_at({
              date: DATE_FMT.format(sprint.completedAt)
            })}
          </span>
        )}
      </div>
    </header>
  )
}

function NameField({
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
          "-mx-1 truncate rounded px-1 text-left text-2xl font-semibold tracking-tight",
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

function DateRangeField({
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
  const [editing, setEditing] = useState(false)
  const [start, setStart] = useState(toDateInputValue(sprint.startsAt))
  const [end, setEnd] = useState(toDateInputValue(sprint.endsAt))

  useEffect(() => {
    if (!editing) {
      setStart(toDateInputValue(sprint.startsAt))
      setEnd(toDateInputValue(sprint.endsAt))
    }
  }, [editing, sprint.startsAt, sprint.endsAt])

  function commit() {
    const next = {
      startsAt: start ? parseDateInput(start) : null,
      endsAt: end ? parseDateInput(end) : null
    }
    update({ groupId: sprint.id, patch: next })
    setEditing(false)
  }

  if (disabled || !editing) {
    return (
      <button
        type="button"
        disabled={disabled}
        onClick={() => setEditing(true)}
        className={cn(
          "rounded px-1 font-mono text-[11px] tabular-nums",
          !disabled && "hover:bg-accent/40"
        )}
      >
        {sprint.startsAt && sprint.endsAt
          ? `${DATE_FMT.format(sprint.startsAt)} – ${DATE_FMT.format(sprint.endsAt)}`
          : m.sprints_date_range_label()}
      </button>
    )
  }
  return (
    <span className="inline-flex items-center gap-1 rounded px-1">
      <input
        autoFocus
        type="date"
        value={start}
        onChange={(e) => setStart(e.target.value)}
        onBlur={commit}
        className="bg-transparent font-mono text-[11px] outline-none"
      />
      <span>–</span>
      <input
        type="date"
        value={end}
        onChange={(e) => setEnd(e.target.value)}
        onBlur={commit}
        className="bg-transparent font-mono text-[11px] outline-none"
      />
    </span>
  )
}

function SprintMenu({
  orgSlug,
  slug,
  sprint,
  onRequestComplete
}: {
  orgSlug: string
  slug: string
  sprint: Group
  onRequestComplete?: () => void
}) {
  const navigate = useNavigate()
  const key = projectKey(orgSlug, slug)
  const remove = useAtomSet(deleteSprintAtom(key), { mode: "promiseExit" })
  const removeState = useAtomValue(deleteSprintAtom(key))
  const deleting = removeState.waiting
  const [confirming, setConfirming] = useState(false)
  const isCompleted = sprint.completedAt !== null

  async function onDelete(groupId: GroupId) {
    const exit = await remove({ groupId })
    if (Exit.isSuccess(exit)) {
      navigate({
        to: "/orgs/$orgSlug/projects/$slug/sprints",
        params: { orgSlug, slug }
      })
    }
  }

  return (
    <DropdownMenu
      onOpenChange={(open) => {
        if (!open) setConfirming(false)
      }}
    >
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          aria-label={m.sprints_actions_aria_label()}
          className="grid size-8 shrink-0 place-items-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring outline-none"
        >
          <MoreHorizontal className="size-4" strokeWidth={1.75} />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" sideOffset={6} className="w-56">
        {!isCompleted && onRequestComplete && (
          <>
            <DropdownMenuItem
              onSelect={(e) => {
                e.preventDefault()
                onRequestComplete()
              }}
              className="cursor-pointer"
            >
              <CheckCircle2 className="size-4" strokeWidth={1.75} />
              {m.sprints_complete_button()}
            </DropdownMenuItem>
            <DropdownMenuSeparator />
          </>
        )}
        {!confirming ? (
          <DropdownMenuItem
            onSelect={(e) => {
              e.preventDefault()
              setConfirming(true)
            }}
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
