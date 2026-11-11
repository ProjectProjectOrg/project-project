import { useAtomSet, useAtomValue } from "@effect/atom-react"
import { sprintState, type Group } from "@pp/shared"
import { Link, useNavigate } from "@tanstack/react-router"
import * as DateTime from "effect/DateTime"
import * as Exit from "effect/Exit"
import * as Result from "effect/reactivity/AsyncResult"
import {
  CalendarX,
  MoreHorizontal,
  Play,
  RotateCcw,
  SlidersHorizontal,
  Trash2
} from "lucide-react"
import { useRef, useState, type KeyboardEvent } from "react"

import type { DateRange } from "@/components/ui/calendar"
import { Calendar } from "@/components/ui/calendar"
import { ConfirmButton } from "@/components/ui/confirm-button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger
} from "@/components/ui/dropdown-menu"
import { Hitbox } from "@/components/ui/hitbox"
import {
  Popover,
  PopoverContent,
  PopoverTrigger
} from "@/components/ui/popover"
import { useProjectRoute } from "@/features/projects/hooks/useProject"
import {
  completeSprint,
  deleteSprint,
  sprintListRequest,
  updateSprint
} from "@/features/sprints/atoms/sprintList"
import {
  sprintDateDraft,
  sprintEnded,
  sprintDatesPatch,
  startSprintPatch
} from "@/features/sprints/lib/sprintDates"
import { cn } from "@/lib/utils"
import { m } from "@/paraglide/messages"

import { CompleteSprintSubmenu } from "./CompleteSprintMenu"
import {
  shortDateFormatter,
  sprintStatusText,
  SprintStateIcon
} from "./SprintChip"
import { SprintEstimateTotals } from "./SprintEstimateTotals"

export const nowDate = () => DateTime.toDate(DateTime.nowUnsafe())

export function SprintStatusSelect({
  sprint,
  sprints
}: {
  sprint: Group
  sprints: ReadonlyArray<Group>
}) {
  const { orgSlug, slug } = useProjectRoute()
  const req = sprintListRequest(orgSlug, slug)
  const completeState = useAtomValue(
    completeSprint({ req, groupId: sprint.id })
  )
  const update = useAtomSet(updateSprint({ req, groupId: sprint.id }))
  const reopenState = useAtomValue(updateSprint({ req, groupId: sprint.id }))
  const isCompleted = sprint.completedAt !== null
  const reopening = reopenState.waiting
  const failed =
    Result.isFailure(completeState) || Result.isFailure(reopenState)

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <Hitbox
            mode="inline"
            margin="1"
            aria-label={m.sprints_status_aria_label()}
          >
            <span className="-mt-1 grid size-10 place-items-center rounded-lg bg-muted transition-colors hitbox-hover:bg-foreground/5">
              <SprintStateIcon sprint={sprint} size="lg" />
            </span>
          </Hitbox>
        }
      />
      <DropdownMenuContent align="start" sideOffset={8} className="w-56">
        {sprintState(sprint) === "planned" ? (
          <>
            <DropdownMenuItem
              onClick={() => update(startSprintPatch(sprint, nowDate()))}
              disabled={reopening}
              className="cursor-pointer"
            >
              <Play className="size-4" strokeWidth={1.75} />
              {m.sprints_start_button()}
            </DropdownMenuItem>
            {sprint.startsAt !== null && (
              <DropdownMenuItem
                onClick={() => update({ startsAt: null, endsAt: null })}
                disabled={reopening}
                className="cursor-pointer"
              >
                <CalendarX className="size-4" strokeWidth={1.75} />
                {m.sprints_unschedule()}
              </DropdownMenuItem>
            )}
          </>
        ) : isCompleted ? (
          <DropdownMenuItem
            onClick={() => update({ completedAt: null })}
            disabled={reopening}
            className="cursor-pointer"
          >
            <RotateCcw className="size-4" strokeWidth={1.75} />
            {m.sprints_reopen_button()}
          </DropdownMenuItem>
        ) : (
          <CompleteSprintSubmenu sprint={sprint} sprints={sprints} />
        )}
        {failed && (
          <div
            role="alert"
            className="px-2 py-1.5 text-caption text-destructive"
          >
            {m.sprints_status_error_fallback()}
          </div>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

export function SprintNameField({
  sprint,
  disabled
}: {
  sprint: Group
  disabled: boolean
}) {
  const { orgSlug, slug } = useProjectRoute()
  const req = sprintListRequest(orgSlug, slug)
  const update = useAtomSet(updateSprint({ req, groupId: sprint.id }), {
    mode: "promiseExit"
  })
  const updateState = useAtomValue(updateSprint({ req, groupId: sprint.id }))
  const saving = updateState.waiting
  const failed = Result.isFailure(updateState)
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(sprint.name)

  async function commit() {
    const trimmed = draft.trim()
    if (!trimmed || trimmed === sprint.name) {
      setEditing(false)
      setDraft(sprint.name)
      return
    }
    const exit = await update({ name: trimmed })
    if (Exit.isSuccess(exit)) setEditing(false)
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
        onClick={() => {
          if (disabled) return
          setDraft(sprint.name)
          setEditing(true)
        }}
        disabled={disabled}
        className={cn(
          "-mx-1 truncate rounded px-1 text-left text-display font-bold transition-colors transition-transform duration-100 active:scale-[0.97]",
          !disabled && "hover:bg-hover"
        )}
      >
        {sprint.name}
      </button>
    )
  }
  return (
    <div className="relative w-full min-w-0">
      <input
        autoFocus
        value={draft}
        disabled={saving}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={() => void commit()}
        onKeyDown={handleKey}
        className="-mx-1 w-full rounded bg-transparent px-1 text-display font-bold ring-2 ring-ring/50 outline-none"
        maxLength={120}
      />
      {failed && (
        <p
          role="alert"
          className="absolute top-full left-0 mt-1 text-caption text-destructive"
        >
          {m.sprints_name_error()}
        </p>
      )}
    </div>
  )
}

export function SprintSubtitle({
  sprint,
  disabled
}: {
  sprint: Group
  disabled: boolean
}) {
  const status = sprintStatusText(sprint, nowDate())
  return (
    <div className="flex items-center gap-2 text-caption text-muted-foreground">
      <SprintDatesField sprint={sprint} disabled={disabled} />
      {status !== null && (
        <>
          <span aria-hidden>·</span>
          <span
            className={cn(
              "font-mono tabular-nums",
              sprintEnded(sprint) && "text-state-warning"
            )}
          >
            {status}
          </span>
        </>
      )}
      <SprintEstimateTotals sprint={sprint} />
    </div>
  )
}

function SprintDatesField({
  sprint,
  disabled
}: {
  sprint: Group
  disabled: boolean
}) {
  const { orgSlug, slug } = useProjectRoute()
  const req = sprintListRequest(orgSlug, slug)
  const update = useAtomSet(updateSprint({ req, groupId: sprint.id }))
  const [open, setOpen] = useState(false)
  const [draft, setDraft] = useState<DateRange>(sprintDateDraft(sprint))

  const fmt = shortDateFormatter()
  const label =
    sprint.startsAt === null
      ? m.sprints_not_scheduled()
      : sprint.endsAt === null
        ? sprintState(sprint) === "active"
          ? m.sprints_started_on({ date: fmt.format(sprint.startsAt) })
          : m.sprints_starts_on({ date: fmt.format(sprint.startsAt) })
        : `${fmt.format(sprint.startsAt)} – ${fmt.format(sprint.endsAt)}`

  if (disabled) {
    return <span className="font-mono tabular-nums">{label}</span>
  }
  return (
    <Popover
      open={open}
      onOpenChange={(next) => {
        setOpen(next)
        if (next) {
          setDraft(sprintDateDraft(sprint))
          return
        }
        const patch = sprintDatesPatch(sprint, draft)
        if (patch) update(patch)
      }}
    >
      <PopoverTrigger
        render={
          <button
            type="button"
            className="-mx-1 rounded px-1 font-mono tabular-nums transition-colors transition-transform duration-100 hover:bg-hover hover:text-foreground active:scale-[0.97]"
          >
            {label}
          </button>
        }
      />
      <PopoverContent align="start" initialFocus={false} className="w-auto p-0">
        <Calendar
          mode="range"
          selected={draft}
          onSelect={(r) => setDraft(r ?? { from: undefined, to: undefined })}
          defaultMonth={draft.from ?? DateTime.toDate(DateTime.nowUnsafe())}
        />
      </PopoverContent>
    </Popover>
  )
}

export function SprintDeleteMenu({ sprint }: { sprint: Group }) {
  const { orgSlug, slug } = useProjectRoute()
  const navigate = useNavigate()
  const req = sprintListRequest(orgSlug, slug)
  const remove = useAtomSet(deleteSprint({ req, groupId: sprint.id }), {
    mode: "promiseExit"
  })
  const removeState = useAtomValue(deleteSprint({ req, groupId: sprint.id }))
  const deleting = removeState.waiting
  const deleteFailed = Result.isFailure(removeState)
  const trigger = useRef<HTMLButtonElement>(null)

  async function onDelete() {
    const exit = await remove(undefined)
    if (Exit.isSuccess(exit)) {
      void navigate({
        to: "/orgs/$orgSlug/projects/$slug/sprints",
        params: { orgSlug, slug }
      })
    }
    return exit
  }

  return (
    <ConfirmButton.Root bare>
      <DropdownMenu>
        <DropdownMenuTrigger
          render={
            <button
              ref={trigger}
              type="button"
              aria-label={m.sprints_actions_aria_label()}
              className="grid size-8 shrink-0 place-items-center rounded-md text-muted-foreground transition-colors transition-transform duration-100 outline-none hover:bg-hover hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring active:scale-[0.97]"
            >
              <MoreHorizontal className="size-4" strokeWidth={1.75} />
            </button>
          }
        />
        <DropdownMenuContent align="end" sideOffset={6} className="w-56">
          <DropdownMenuItem
            render={
              <Link
                to="/orgs/$orgSlug/projects/$slug/settings"
                params={{ orgSlug, slug }}
              />
            }
          >
            <SlidersHorizontal className="size-4" strokeWidth={1.75} />
            {m.project_detail_tab_settings()}
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <ConfirmButton.MenuItem
            variant="destructive"
            className="cursor-pointer"
          >
            <Trash2 className="size-4" strokeWidth={1.75} />
            {m.sprints_delete_button()}
          </ConfirmButton.MenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      <ConfirmButton.Popover anchor={trigger} className="w-72">
        <ConfirmButton.Action
          layout="stacked"
          prompt={m.sprints_delete_confirm_title()}
          description={m.sprints_delete_confirm_description()}
          label={m.common_delete_confirm_button()}
          waiting={deleting}
          error={deleteFailed ? m.sprints_delete_error_fallback() : null}
          onConfirm={onDelete}
        />
      </ConfirmButton.Popover>
    </ConfirmButton.Root>
  )
}
