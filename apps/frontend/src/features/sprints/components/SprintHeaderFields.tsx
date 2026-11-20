import { useAtomSet, useAtomValue } from "@effect/atom-react"
import { sprintState, type Group } from "@pp/shared"
import { Chip } from "@pp/ui/chip"
import {
  DropdownMenu,
  DropdownMenuConfirmItem,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger
} from "@pp/ui/dropdown-menu"
import { Hitbox } from "@pp/ui/hitbox"
import {
  CalendarRange,
  CalendarX,
  MoreHorizontal,
  Play,
  RotateCcw,
  SlidersHorizontal,
  Trash2
} from "@pp/ui/icons"
import { bareFieldStateClass } from "@pp/ui/input"
import { cn } from "@pp/ui/lib/utils"
import { Link, useNavigate } from "@tanstack/react-router"
import * as Exit from "effect/Exit"
import * as Result from "effect/reactivity/AsyncResult"
import { useRef, useState, type KeyboardEvent } from "react"

import { useProjectRoute } from "@/features/projects/hooks/useProject"
import {
  completeSprint,
  deleteSprint,
  sprintListRequest,
  updateSprint
} from "@/features/sprints/atoms/sprintList"
import {
  nowDate,
  sprintDateDraft,
  sprintEnded,
  sprintDatesPatch,
  startSprintPatch,
  type SprintDateDraft
} from "@/features/sprints/lib/sprintDates"
import { describeCause } from "@/lib/errorMessage"
import { m } from "@/paraglide/messages"

import { CompleteSprintSubmenu } from "./CompleteSprintMenu"
import { NewSprintPopover } from "./NewSprintPopover"
import {
  shortDateFormatter,
  sprintStatusText,
  SprintStateIcon
} from "./SprintChip"
import { SprintDatesPicker } from "./SprintDatesPicker"
import { SprintEstimateTotals } from "./SprintEstimateTotals"

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
  const [creating, setCreating] = useState(false)
  const statusButton = useRef<HTMLButtonElement>(null)
  const reopening = reopenState.waiting
  const failed =
    Result.isFailure(completeState) || Result.isFailure(reopenState)

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger
          ref={statusButton}
          render={
            <Hitbox
              mode="inline"
              margin="1"
              aria-label={m.sprints_status_aria_label()}
              className="-mt-1 rounded-lg"
            >
              <span className="grid size-10 place-items-center rounded-lg bg-muted transition-colors hitbox-hover:bg-foreground/5">
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
            <CompleteSprintSubmenu
              sprint={sprint}
              sprints={sprints}
              onNew={() => setCreating(true)}
            />
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
      {/* "Complete into a new sprint" opens the composer on this button. */}
      <NewSprintPopover
        anchor={statusButton}
        open={creating}
        onOpenChange={setCreating}
        completeFrom={sprint}
      />
    </>
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
          bareFieldStateClass,
          "focus-ring -mx-2 truncate px-2 text-left text-display font-bold transition-[background-color,scale] focus-visible:bg-transparent active:scale-97"
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
        className={cn(
          bareFieldStateClass,
          "-mx-2 w-[calc(100%+1rem)] bg-transparent px-2 text-display font-bold outline-none"
        )}
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
    <div className="-mx-1.5 flex items-center gap-1">
      <SprintDatesField sprint={sprint} disabled={disabled} />
      {status !== null && (
        <Chip
          className={cn(
            "tabular-nums",
            sprintEnded(sprint) && "text-state-warning"
          )}
        >
          {status}
        </Chip>
      )}
      <SprintEstimateTotals sprint={sprint} />
    </div>
  )
}

export function SprintDatesField({
  sprint,
  disabled
}: {
  sprint: Group
  disabled: boolean
}) {
  const { orgSlug, slug } = useProjectRoute()
  const req = sprintListRequest(orgSlug, slug)
  const update = useAtomSet(updateSprint({ req, groupId: sprint.id }))
  const [draft, setDraft] = useState<SprintDateDraft>(sprintDateDraft(sprint))

  const fmt = shortDateFormatter()
  const label =
    sprint.startsAt === null
      ? m.sprints_not_scheduled()
      : sprint.endsAt === null
        ? sprintState(sprint) === "active"
          ? m.sprints_started_on({ date: fmt.format(sprint.startsAt) })
          : m.sprints_starts_on({ date: fmt.format(sprint.startsAt) })
        : `${fmt.format(sprint.startsAt)} – ${fmt.format(sprint.endsAt)}`

  const content = (
    <>
      <CalendarRange className="size-3 shrink-0" strokeWidth={1.75} />
      {label}
    </>
  )
  if (disabled) {
    return <Chip className="tabular-nums">{content}</Chip>
  }
  return (
    <SprintDatesPicker
      value={draft}
      onChange={setDraft}
      allowPast
      onOpenChange={(open) => {
        if (open) {
          setDraft(sprintDateDraft(sprint))
          return
        }
        const patch = sprintDatesPatch(sprint, draft)
        if (patch) update(patch)
      }}
      trigger={
        <Chip interaction="press" data-sprint-dates className="tabular-nums">
          {content}
        </Chip>
      }
    />
  )
}

export function SprintDeleteMenu({ sprint }: { sprint: Group }) {
  const { orgSlug, slug } = useProjectRoute()
  const navigate = useNavigate()
  const req = sprintListRequest(orgSlug, slug)
  const remove = useAtomSet(deleteSprint({ req, groupId: sprint.id }), {
    mode: "promiseExit"
  })

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
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <button
            type="button"
            aria-label={m.sprints_actions_aria_label()}
            className="grid size-8 shrink-0 place-items-center rounded-md text-muted-foreground transition-colors transition-transform duration-100 outline-none hover:bg-hover hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring active:scale-97"
          >
            <MoreHorizontal className="size-4" strokeWidth={1.75} />
          </button>
        }
      />
      <DropdownMenuContent align="end" sideOffset={6} className="w-56">
        <DropdownMenuItem
          render={
            <Link
              to="/settings/orgs/$orgSlug/projects/$slug"
              params={{ orgSlug, slug }}
            />
          }
        >
          <SlidersHorizontal className="size-4" strokeWidth={1.75} />
          {m.project_detail_tab_settings()}
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuConfirmItem
          icon={<Trash2 className="size-4" strokeWidth={1.75} />}
          label={m.sprints_delete_button()}
          confirmLabel={m.sprints_delete_confirm_title()}
          busyLabel={m.common_deleting_button()}
          describeError={describeCause}
          onConfirm={onDelete}
        />
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
