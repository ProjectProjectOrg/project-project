import { useAtomSet } from "@effect/atom-react"
import { pickActiveSprint, type Group } from "@pp/shared"
import { useDebouncedValue } from "@tanstack/react-pacer"
import { useNavigate } from "@tanstack/react-router"
import * as Cause from "effect/Cause"
import * as Exit from "effect/Exit"
import {
  CalendarDays,
  CalendarX,
  Check,
  Inbox,
  Pencil,
  Plus,
  Trash2
} from "lucide-react"
import { useState, type ReactNode } from "react"

import { CommandMenuItem } from "@/components/ui/command-menu"
import { CommandFrame } from "@/features/command-menu/components/CommandFrame"
import type { SprintContext } from "@/features/command-menu/lib/commandMenu"
import type { CommandPageProps } from "@/features/command-menu/lib/commandPages"
import {
  deleteSprint,
  sprintListRequest,
  updateSprint
} from "@/features/sprints/atoms/sprintList"
import { parseStartDate, WEEKDAYS } from "@/features/sprints/lib/parseStartDate"
import {
  addDays,
  DEFAULT_SPRINT_DAYS,
  daysBetween,
  sprintLengthDays,
  startPresets,
  startSprintPatch,
  type StartPreset
} from "@/features/sprints/lib/sprintDates"
import { errorMessage } from "@/lib/errorMessage"
import { cn } from "@/lib/utils"
import { m } from "@/paraglide/messages"

import { useCompleteSprint } from "./CompleteSprintMenu"
import { SprintStateIcon } from "./SprintChip"
import { DateColumns } from "./SprintDateColumns"

export type SprintPageProps = CommandPageProps &
  Readonly<{ sprint: SprintContext }>

const LENGTHS = [1, 2, 3, 4] as const

const SPELLED_WEEKDAY = new Set(["monday", "mondayAfter"])

const PRESET_LABELS: Readonly<
  Record<Exclude<StartPreset["key"], "afterActive">, () => string>
> = {
  now: m.sprints_schedule_now,
  tomorrow: m.sprints_schedule_tomorrow,
  monday: m.sprints_schedule_monday,
  mondayAfter: m.sprints_schedule_monday_after
}

const WEEK_DAYS = 7

const matchesWords = (label: string, needle: string) => {
  const text = label.toLowerCase()
  return (
    text.startsWith(needle) ||
    text.split(/\s+/u).some((word) => word.startsWith(needle))
  )
}

const scheduleDetail = (sprint: Group, value: string, start: Date) => {
  const { startsAt, endsAt } = startSprintPatch(sprint, start)
  if (startsAt === null || endsAt === null) {
    return <DateColumns weekday={start} start={start} />
  }
  return (
    <DateColumns
      weekday={SPELLED_WEEKDAY.has(value) ? null : startsAt}
      start={startsAt}
      end={endsAt}
    />
  )
}

const lengthAdjective = (sprint: Group) => {
  const days = sprintLengthDays(sprint) ?? DEFAULT_SPRINT_DAYS
  return days % WEEK_DAYS === 0
    ? m.sprints_length_adjective_weeks({ count: days / WEEK_DAYS })
    : m.sprints_length_adjective_days({ count: days })
}

export function SprintContextChip({
  sprint
}: Readonly<{ sprint: SprintContext }>) {
  return (
    <span className="inline-flex h-6 max-w-full min-w-0 items-center gap-1.5 overflow-hidden rounded-[7px] bg-hover px-2 text-[13px]">
      <SprintStateIcon sprint={sprint.sprint} size="xs" />
      <span className="min-w-0 truncate font-medium text-foreground">
        {sprint.sprint.name}
      </span>
    </span>
  )
}

function useUpdateSprint({ orgSlug, slug, sprint }: SprintContext) {
  return useAtomSet(
    updateSprint({ req: sprintListRequest(orgSlug, slug), groupId: sprint.id })
  )
}

function DateRow({
  value,
  label,
  detail,
  current,
  dimmed
}: Readonly<{
  value: string
  label: string
  detail: ReactNode
  current?: boolean
  dimmed?: boolean
}>) {
  return (
    <CommandMenuItem value={value} className={cn(dimmed && "opacity-50")}>
      <span className="min-w-0 flex-1 truncate">{label}</span>
      <span className="shrink-0 text-[13px] text-muted-foreground tabular-nums">
        {detail}
      </span>
      {current !== undefined && (
        <Check
          aria-hidden={!current}
          className={cn("size-3.5 shrink-0", !current && "invisible")}
          strokeWidth={1.75}
        />
      )}
    </CommandMenuItem>
  )
}

export function SprintSchedulePage({ sprint, onBack, env }: SprintPageProps) {
  const update = useUpdateSprint(sprint)
  const [query, setQuery] = useState("")
  const active = pickActiveSprint(
    sprint.sprints.filter((other) => other.id !== sprint.sprint.id)
  )
  const presets = startPresets({ activeEnd: active?.endsAt ?? null })
  const parsed = parseStartDate(query)
  const [settled] = useDebouncedValue(query, { wait: 400 })
  const [lastParsed, setLastParsed] = useState<Date | null>(null)
  if (parsed !== null && parsed.getTime() !== lastParsed?.getTime()) {
    setLastParsed(parsed)
  }
  if (query.trim() === "" && lastParsed !== null) setLastParsed(null)
  const stale = parsed === null && lastParsed !== null && settled !== query
  const typed = parsed ?? (stale ? lastParsed : null)
  const needle = query.trim().toLowerCase()
  const label = (preset: StartPreset) =>
    preset.key === "afterActive"
      ? m.sprints_schedule_after_active({ name: active?.name ?? "" })
      : PRESET_LABELS[preset.key]()
  const matching = presets
    .map((preset) => ({
      value: preset.key,
      label: label(preset),
      date: preset.date
    }))
    .filter(
      (option) =>
        matchesWords(option.label, needle) ||
        (needle.length >= 2 &&
          WEEKDAYS[option.date.getDay()].startsWith(needle))
    )
  const typedIsListed =
    typed !== null &&
    matching.some((option) => daysBetween(option.date, typed) === 0)
  const options = [
    ...(typed === null || typedIsListed
      ? []
      : [{ value: "typed", label: m.sprints_schedule_typed(), date: typed }]),
    ...matching
  ]
  return (
    <CommandFrame
      chip={<SprintContextChip sprint={sprint} />}
      placeholder={m.sprints_schedule_placeholder({
        length: lengthAdjective(sprint.sprint)
      })}
      onBack={onBack}
      filter={false}
      onSearchChange={setQuery}
      empty={
        settled === query
          ? {
              icon: CalendarX,
              title: m.sprints_schedule_unreadable(),
              description: m.sprints_schedule_hint()
            }
          : {
              icon: CalendarDays,
              title: m.sprints_schedule_hint(),
              description: ""
            }
      }
      items={options.map(({ value, label }) => ({ value, label }))}
      onSelect={(item) => {
        const option = options.find((entry) => entry.value === item.value)
        if (option === undefined) return
        update(startSprintPatch(sprint.sprint, option.date))
        env.close()
      }}
      renderItem={(item) => {
        const option = options.find((entry) => entry.value === item.value)
        return option === undefined ? null : (
          <DateRow
            value={item.value}
            label={item.label}
            detail={scheduleDetail(sprint.sprint, item.value, option.date)}
            dimmed={item.value === "typed" && stale}
          />
        )
      }}
    />
  )
}

export function SprintLengthPage({ sprint, onBack, env }: SprintPageProps) {
  const update = useUpdateSprint(sprint)
  const { startsAt } = sprint.sprint
  if (startsAt === null) return null
  const endFor = (weeks: number) => addDays(startsAt, weeks * WEEK_DAYS - 1)
  const days = sprintLengthDays(sprint.sprint)
  const current = days === null ? null : days / WEEK_DAYS
  return (
    <CommandFrame
      chip={<SprintContextChip sprint={sprint} />}
      placeholder={m.sprints_length_placeholder()}
      onBack={onBack}
      items={LENGTHS.map((weeks) => ({
        value: String(weeks),
        label:
          weeks === 1
            ? m.sprints_length_one_week()
            : m.sprints_length_weeks({ count: weeks })
      }))}
      onSelect={(item) => {
        update({ endsAt: endFor(Number(item.value)) })
        env.close()
      }}
      renderItem={(item) => (
        <DateRow
          value={item.value}
          label={item.label}
          detail={
            <DateColumns
              weekday={endFor(Number(item.value))}
              start={endFor(Number(item.value))}
            />
          }
          current={current === Number(item.value)}
        />
      )}
    />
  )
}

export function SprintRenamePage({ sprint, onBack, env }: SprintPageProps) {
  const update = useUpdateSprint(sprint)
  const [name, setName] = useState("")
  const trimmed = name.trim()
  const valid = trimmed !== "" && trimmed !== sprint.sprint.name
  return (
    <CommandFrame
      chip={<SprintContextChip sprint={sprint} />}
      placeholder={m.sprints_rename_placeholder()}
      onBack={onBack}
      filter={false}
      onSearchChange={setName}
      empty={{
        icon: Pencil,
        title: m.sprints_rename_empty(),
        description: ""
      }}
      items={
        valid
          ? [
              {
                value: "rename",
                label: m.sprints_rename_to({ name: trimmed }),
                icon: Pencil
              }
            ]
          : []
      }
      onSelect={() => {
        update({ name: trimmed.slice(0, 120) })
        env.close()
      }}
    />
  )
}

export function SprintCompletePage({ sprint, onBack, env }: SprintPageProps) {
  const action = useCompleteSprint(sprint)
  const { unfinished, targets, completeTo, completeToNew } = action
  const items =
    unfinished === 0
      ? [{ value: "backlog", label: m.sprints_complete_button(), icon: Inbox }]
      : [
          {
            value: "backlog",
            label: m.sprints_complete_backlog_option(),
            icon: Inbox
          },
          ...targets.map((target) => ({
            value: target.id,
            label: target.name
          })),
          {
            value: "new",
            label: m.sprints_complete_new_option(),
            icon: Plus
          }
        ]
  const description =
    unfinished === null
      ? m.sprints_complete_move_label()
      : m.sprints_complete_move_count({ count: unfinished })
  return (
    <CommandFrame
      chip={<SprintContextChip sprint={sprint} />}
      placeholder={description}
      description={description}
      onBack={onBack}
      items={items}
      onSelect={(item) => {
        if (item.value === "new") completeToNew()
        else if (item.value === "backlog") completeTo({ kind: "backlog" })
        else {
          const target = targets.find((entry) => entry.id === item.value)
          if (target !== undefined) {
            completeTo({ kind: "sprint", groupId: target.id })
          }
        }
        env.close()
      }}
      renderItem={(item) => {
        const target = targets.find((entry) => entry.id === item.value)
        return (
          <CommandMenuItem value={item.value}>
            {target !== undefined && (
              <SprintStateIcon sprint={target} size="md" />
            )}
            <span className="min-w-0 flex-1 truncate">{item.label}</span>
          </CommandMenuItem>
        )
      }}
    />
  )
}

export function SprintDeletePage({ sprint, onBack, env }: SprintPageProps) {
  const { orgSlug, slug } = sprint
  const navigate = useNavigate()
  const remove = useAtomSet(
    deleteSprint({
      req: sprintListRequest(orgSlug, slug),
      groupId: sprint.sprint.id
    }),
    { mode: "promiseExit" }
  )
  const [failure, setFailure] = useState<string | null>(null)
  return (
    <CommandFrame
      chip={<SprintContextChip sprint={sprint} />}
      placeholder={m.sprints_delete_confirm_description()}
      description={m.sprints_delete_confirm_description()}
      onBack={onBack}
      notice={failure}
      items={[
        {
          value: "delete",
          label: m.sprints_delete_action({ name: sprint.sprint.name }),
          icon: Trash2
        }
      ]}
      onSelect={async () => {
        setFailure(null)
        const exit = await remove(undefined)
        if (Exit.isFailure(exit)) {
          setFailure(errorMessage(Cause.squash(exit.cause)))
          return
        }
        env.close()
        void navigate({
          to: "/orgs/$orgSlug/projects/$slug/sprints",
          params: { orgSlug, slug }
        })
      }}
      renderItem={(item) => (
        <CommandMenuItem value={item.value} className="text-destructive">
          <span className="min-w-0 flex-1 truncate">{item.label}</span>
        </CommandMenuItem>
      )}
    />
  )
}
