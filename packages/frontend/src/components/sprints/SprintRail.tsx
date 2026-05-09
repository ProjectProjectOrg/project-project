import {
  Result,
  useAtomSet,
  useAtomValue
} from "@effect-atom/atom-react"
import { Link, useParams } from "@tanstack/react-router"
import { Exit } from "effect"
import { Plus } from "lucide-react"
import { useState, type FormEvent } from "react"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import { m } from "@/paraglide/messages"
import {
  createSprintAtom,
  projectKey,
  sprintsListAtom
} from "@/atoms/sprints"
import {
  pickActiveSprint,
  sprintState,
  type Group
} from "@projectproject/shared"
import { SprintStateDot } from "./SprintChip"

const DATE_FMT = new Intl.DateTimeFormat(undefined, {
  month: "short",
  day: "numeric"
})

function formatRange(s: Group): string {
  if (!s.startsAt || !s.endsAt) return ""
  return `${DATE_FMT.format(s.startsAt)} – ${DATE_FMT.format(s.endsAt)}`
}

function toDateInputValue(d: Date): string {
  const yyyy = d.getFullYear()
  const mm = String(d.getMonth() + 1).padStart(2, "0")
  const dd = String(d.getDate()).padStart(2, "0")
  return `${yyyy}-${mm}-${dd}`
}

function parseDateInput(value: string): Date {
  const [y, m, d] = value.split("-").map(Number)
  return new Date(y, (m ?? 1) - 1, d ?? 1)
}

export function SprintRail({
  orgSlug,
  slug
}: {
  orgSlug: string
  slug: string
}) {
  const key = projectKey(orgSlug, slug)
  const list = useAtomValue(sprintsListAtom(key))
  const sprints = Result.isSuccess(list) ? list.value : []
  const now = new Date()

  const active: Array<Group> = []
  const planned: Array<Group> = []
  const completed: Array<Group> = []
  for (const s of sprints) {
    const state = sprintState(s, now)
    if (state === "active") active.push(s)
    else if (state === "planned") planned.push(s)
    else completed.push(s)
  }
  const sortByStart = (a: Group, b: Group) =>
    (a.startsAt?.getTime() ?? 0) - (b.startsAt?.getTime() ?? 0)
  active.sort(sortByStart)
  planned.sort(sortByStart)
  completed.sort(
    (a, b) =>
      (b.completedAt?.getTime() ?? 0) - (a.completedAt?.getTime() ?? 0)
  )

  return (
    <aside className="flex w-60 shrink-0 flex-col gap-5 border-r border-border pr-4">
      <NewSprintForm orgSlug={orgSlug} slug={slug} />
      <Section
        label={m.sprints_active_label()}
        count={active.length}
        sprints={active}
        orgSlug={orgSlug}
        slug={slug}
      />
      <Section
        label={m.sprints_planned_label()}
        count={planned.length}
        sprints={planned}
        orgSlug={orgSlug}
        slug={slug}
      />
      <Section
        label={m.sprints_completed_label()}
        count={completed.length}
        sprints={completed}
        orgSlug={orgSlug}
        slug={slug}
        dim
      />
    </aside>
  )
}

function Section({
  label,
  count,
  sprints,
  orgSlug,
  slug,
  dim
}: {
  label: string
  count: number
  sprints: ReadonlyArray<Group>
  orgSlug: string
  slug: string
  dim?: boolean
}) {
  if (count === 0) return null
  return (
    <section className="flex flex-col gap-1">
      <header className="flex items-center justify-between px-2 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
        <span>{label}</span>
        <span className="font-mono text-[10px] tabular-nums">{count}</span>
      </header>
      <ul className={cn("flex flex-col", dim && "opacity-80")}>
        {sprints.map((s) => (
          <li key={s.id}>
            <RailRow sprint={s} orgSlug={orgSlug} slug={slug} />
          </li>
        ))}
      </ul>
    </section>
  )
}

function RailRow({
  sprint,
  orgSlug,
  slug
}: {
  sprint: Group
  orgSlug: string
  slug: string
}) {
  const params = useParams({ strict: false }) as { groupId?: string }
  const isSelected = params.groupId === sprint.id
  return (
    <Link
      to="/orgs/$orgSlug/projects/$slug/sprints/$groupId"
      params={{ orgSlug, slug, groupId: sprint.id }}
      className={cn(
        "group/list-row flex items-center gap-2 rounded-md px-2 py-1.5 text-left transition-colors",
        isSelected
          ? "bg-accent/40 text-foreground"
          : "text-muted-foreground hover:bg-accent/30 hover:text-foreground"
      )}
      aria-current={isSelected ? "page" : undefined}
    >
      <SprintStateDot sprint={sprint} />
      <span className="min-w-0 flex-1 truncate text-sm">{sprint.name}</span>
      <span className="font-mono text-[11px] text-muted-foreground tabular-nums">
        {formatRange(sprint)}
      </span>
      <span className="font-mono text-[10px] tabular-nums text-muted-foreground">
        {sprint.tickets.length}
      </span>
    </Link>
  )
}

function NewSprintForm({
  orgSlug,
  slug
}: {
  orgSlug: string
  slug: string
}) {
  const key = projectKey(orgSlug, slug)
  const create = useAtomSet(createSprintAtom(key), { mode: "promiseExit" })
  const state = useAtomValue(createSprintAtom(key))
  const submitting = state.waiting
  const error = Result.isFailure(state)
    ? m.sprints_create_error_fallback()
    : null

  const today = new Date()
  const defaultEnd = new Date(today)
  defaultEnd.setDate(defaultEnd.getDate() + 14)

  const [open, setOpen] = useState(false)
  const [name, setName] = useState("")
  const [startsAt, setStartsAt] = useState(toDateInputValue(today))
  const [endsAt, setEndsAt] = useState(toDateInputValue(defaultEnd))

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    const trimmed = name.trim()
    if (!trimmed || submitting) return
    const exit = await create({
      name: trimmed,
      startsAt: parseDateInput(startsAt),
      endsAt: parseDateInput(endsAt)
    })
    if (Exit.isSuccess(exit)) {
      setName("")
      setOpen(false)
    }
  }

  if (!open) {
    return (
      <Button
        type="button"
        variant="tertiary"
        size="sm"
        className="justify-start"
        leadingIcon={Plus}
        onClick={() => setOpen(true)}
      >
        {m.sprints_new_button()}
      </Button>
    )
  }
  return (
    <form
      onSubmit={onSubmit}
      className="flex flex-col gap-2 rounded-md border border-border bg-background p-2"
    >
      <input
        autoFocus
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder={m.sprints_new_name_placeholder()}
        disabled={submitting}
        className="w-full bg-transparent text-sm outline-none"
        maxLength={120}
      />
      <div className="flex items-center gap-1.5">
        <input
          type="date"
          value={startsAt}
          onChange={(e) => setStartsAt(e.target.value)}
          disabled={submitting}
          className="flex-1 rounded bg-transparent font-mono text-[11px] text-muted-foreground outline-none"
        />
        <span className="text-muted-foreground">–</span>
        <input
          type="date"
          value={endsAt}
          onChange={(e) => setEndsAt(e.target.value)}
          disabled={submitting}
          className="flex-1 rounded bg-transparent font-mono text-[11px] text-muted-foreground outline-none"
        />
      </div>
      {error && <p className="text-xs text-destructive">{error}</p>}
      <div className="flex justify-end gap-1">
        <Button
          type="button"
          variant="tertiary"
          size="xs"
          onClick={() => {
            setOpen(false)
            setName("")
          }}
          disabled={submitting}
        >
          {m.common_cancel_button()}
        </Button>
        <Button
          type="submit"
          variant="primary"
          size="xs"
          disabled={!name.trim() || submitting}
        >
          {submitting
            ? m.sprints_create_in_progress()
            : m.sprints_create_button()}
        </Button>
      </div>
    </form>
  )
}

export { pickActiveSprint }
