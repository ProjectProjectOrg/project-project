import { useAtomSet, useAtomValue } from "@effect-atom/atom-react"
import { useNavigate } from "@tanstack/react-router"
import * as DateTime from "effect/DateTime"
import * as Exit from "effect/Exit"
import { CheckCircle2, MoreHorizontal, Trash2 } from "lucide-react"
import { useEffect, useState, type KeyboardEvent } from "react"
import type { DateRange } from "react-day-picker"
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger
} from "@/components/ui/accordion"
import { Button } from "@/components/ui/button"
import { Calendar } from "@/components/ui/calendar"
import { LexicalEditor, type SaveStatus } from "@/components/LexicalEditor"
import { MentionScopeProvider } from "@/mentions/scope"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger
} from "@/components/ui/dropdown-menu"
import {
  Popover,
  PopoverContent,
  PopoverTrigger
} from "@/components/ui/popover"
import { cn } from "@/lib/utils"
import { m } from "@/paraglide/messages"
import { getLocale } from "@/paraglide/runtime"
import { deleteSprintAtom, projectKey, updateSprintAtom } from "@/atoms/sprints"
import {
  daysLeft,
  sprintState,
  type Group,
  type GroupDetail,
  type GroupId
} from "@projectproject/shared"
import { useProject } from "@/routes/_authed/orgs/$orgSlug/projects/$slug/-context"
import { SprintStateIcon } from "./SprintChip"

const fullDateFormatter = () =>
  new Intl.DateTimeFormat(getLocale(), {
    month: "short",
    day: "numeric",
    year: "numeric"
  })

const shortDateFormatter = () =>
  new Intl.DateTimeFormat(getLocale(), {
    month: "short",
    day: "numeric"
  })

export function SprintDetailHeader({
  orgSlug,
  slug,
  sprint,
  onRequestComplete
}: {
  orgSlug: string
  slug: string
  sprint: GroupDetail
  onRequestComplete?: () => void
}) {
  const isCompleted = sprint.completedAt !== null
  const left = daysLeft(sprint.endsAt)
  const state = sprintState(sprint)

  return (
    <header className="flex flex-col gap-2">
      <div className="flex min-w-0 items-center gap-2 px-3">
        <SprintStateIcon sprint={sprint} />
        <NameField
          orgSlug={orgSlug}
          slug={slug}
          sprint={sprint}
          disabled={isCompleted}
        />
        <DateRangeField
          orgSlug={orgSlug}
          slug={slug}
          sprint={sprint}
          disabled={isCompleted}
        />
        {state === "active" && left !== null && left >= 0 && (
          <span className="font-mono text-[11px] tabular-nums text-muted-foreground">
            {m.sprints_active_with_days_left({ days: left })}
          </span>
        )}
        {state === "active" && left !== null && left < 0 && (
          <span className="font-mono text-[11px] tabular-nums text-foreground">
            {m.sprints_overdue_with_days({ days: -left })}
          </span>
        )}
        {state === "completed" && sprint.completedAt && (
          <span className="font-mono text-[11px] tabular-nums text-muted-foreground">
            {m.sprints_completed_at({
              date: shortDateFormatter().format(sprint.completedAt)
            })}
          </span>
        )}
        <SprintMenu
          orgSlug={orgSlug}
          slug={slug}
          sprint={sprint}
          onRequestComplete={onRequestComplete}
        />
      </div>
      <DescriptionField
        orgSlug={orgSlug}
        slug={slug}
        sprint={sprint}
        disabled={isCompleted}
      />
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
          "-mx-1 self-start truncate rounded px-1 text-left text-2xl font-semibold tracking-tight transition-colors",
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
  const [open, setOpen] = useState(false)
  const initialRange: DateRange = {
    from: sprint.startsAt ?? undefined,
    to: sprint.endsAt ?? undefined
  }
  const [draft, setDraft] = useState<DateRange>(initialRange)

  useEffect(() => {
    if (!open) {
      setDraft({
        from: sprint.startsAt ?? undefined,
        to: sprint.endsAt ?? undefined
      })
    }
  }, [open, sprint.startsAt, sprint.endsAt])

  const fmt = fullDateFormatter()
  const label =
    sprint.startsAt && sprint.endsAt
      ? `${fmt.format(sprint.startsAt)} – ${fmt.format(sprint.endsAt)}`
      : m.sprints_date_range_label()

  if (disabled) {
    return (
      <span className="ml-auto font-mono text-[11px] tabular-nums text-muted-foreground">
        {label}
      </span>
    )
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
          <Button
            type="button"
            variant="chip"
            className="ml-auto text-muted-foreground hover:text-foreground"
          >
            <span className="font-mono text-[11px] tabular-nums">{label}</span>
          </Button>
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

function DescriptionField({
  orgSlug,
  slug,
  sprint,
  disabled
}: {
  orgSlug: string
  slug: string
  sprint: GroupDetail
  disabled: boolean
}) {
  const project = useProject()
  const key = projectKey(orgSlug, slug)
  const update = useAtomSet(updateSprintAtom(key))
  const [status, setStatus] = useState<SaveStatus>("idle")

  if (disabled && sprint.body.trim().length === 0) return null

  const preview = sprint.body.trim().split(/\s+/).slice(0, 16).join(" ")

  return (
    <Accordion type="single" className="w-full">
      <AccordionItem value="desc" className="border-b-0">
        <AccordionTrigger className="items-center gap-2 rounded pl-3 pr-5 py-1 text-left text-sm font-normal text-muted-foreground transition-colors hover:bg-accent/40 hover:no-underline hover:text-foreground [&>svg]:size-3.5 [&>svg]:translate-y-0">
          <span className="flex min-w-0 flex-1 items-center gap-2">
            <span>{m.sprints_description_label()}</span>
            {preview.length > 0 && (
              <span className="min-w-0 flex-1 truncate text-xs text-muted-foreground/70">
                {preview}
              </span>
            )}
            {status !== "idle" && (
              <span className="shrink-0 text-xs text-muted-foreground tabular-nums">
                {status === "saving"
                  ? m.tickets_save_status_saving()
                  : status === "dirty"
                    ? m.tickets_save_status_dirty()
                    : m.tickets_save_status_saved()}
              </span>
            )}
          </span>
        </AccordionTrigger>
        <AccordionContent className="pt-2 pb-0">
          <div
            className={cn(
              "rounded-lg border border-border bg-background px-3 py-2",
              disabled && "opacity-70"
            )}
          >
            <MentionScopeProvider
              scope={{ orgSlug, slug, members: project.members }}
            >
              <LexicalEditor
                key={`sprint:${sprint.id}`}
                markdown={sprint.body}
                onChange={(next) => {
                  if (disabled) return
                  update({ groupId: sprint.id, patch: { body: next } })
                }}
                onStatusChange={setStatus}
                placeholder={m.sprints_description_placeholder()}
              />
            </MentionScopeProvider>
          </div>
        </AccordionContent>
      </AccordionItem>
    </Accordion>
  )
}

function SprintMenu({
  orgSlug,
  slug,
  sprint,
  onRequestComplete,
  className
}: {
  orgSlug: string
  slug: string
  sprint: Group
  onRequestComplete?: () => void
  className?: string
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
      <DropdownMenuTrigger
        render={
          <button
            type="button"
            aria-label={m.sprints_actions_aria_label()}
            className={cn(
              "grid size-8 shrink-0 place-items-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring outline-none",
              className
            )}
          >
            <MoreHorizontal className="size-4" strokeWidth={1.75} />
          </button>
        }
      />
      <DropdownMenuContent align="end" sideOffset={6} className="w-56">
        {!isCompleted && onRequestComplete && (
          <>
            <DropdownMenuItem
              closeOnClick={false}
              onClick={() => onRequestComplete()}
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
