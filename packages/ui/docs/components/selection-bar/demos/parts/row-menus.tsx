import { Chip, ChipDots } from "@pp/ui/chip"
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuTrigger
} from "@pp/ui/dropdown-menu"
import { Flag, Tag, User, Zap } from "@pp/ui/icons"
import { cn } from "@pp/ui/lib/utils"
import { MemberAvatar } from "@pp/ui/member-avatar"
import type { SelectionBarResult } from "@pp/ui/selection-bar"
import * as React from "react"

import { PRIORITY, STATUS } from "../../../list-row/demos/parts/tickets"
import {
  countOf,
  PEOPLE,
  plural,
  PRIORITIES,
  SPRINTS,
  STATUSES,
  TAGS,
  TICKETS,
  type DemoTicket
} from "./backlog"
import type { Field } from "./keys"

/*
 * The rows are the toolbar: a row's own status, priority, assignee, sprint
 * and labels open a menu that changes every selected ticket (or just that
 * one, when it isn't selected). A pick applies at once: chip, then value,
 * two clicks; the bar says what happened and offers Undo. The menu says
 * how many of the selection have each value, and marks the suggested one,
 * which it starts on, so Enter takes it.
 */

export type ListLab = ReturnType<typeof useListLab>

// The whole list, what's selected, and what an edit did.
export function useListLab() {
  const [rows, setRows] = React.useState<ReadonlyArray<DemoTicket>>(TICKETS)
  const [picked, setPicked] = React.useState<ReadonlySet<string>>(
    () =>
      new Set(
        TICKETS.filter((row) => row.status === "progress").map((row) => row.id)
      )
  )
  const [result, setResult] = React.useState<SelectionBarResult | undefined>()
  // Whether you've changed several tickets from a row yet; until then the
  // bar says that's how. (The app would remember it per person.)
  const [taught, setTaught] = React.useState(false)
  React.useEffect(() => {
    if (result === undefined) return undefined
    const timer = window.setTimeout(() => setResult(undefined), 6000)
    return () => window.clearTimeout(timer)
  }, [result])
  const selected = rows.filter((row) => picked.has(row.id))
  // What a row's menu changes: the selection, when the row is in it.
  const targetsOf = (id: string) =>
    picked.has(id) ? selected : rows.filter((row) => row.id === id)
  const edit = (
    ids: ReadonlyArray<string>,
    change: (row: DemoTicket) => DemoTicket
  ) => {
    const before = rows
    if (ids.length > 1) setTaught(true)
    setRows(rows.map((row) => (ids.includes(row.id) ? change(row) : row)))
    setResult({
      tone: "success",
      message: `Updated ${plural(ids.length, "ticket", "tickets")}`,
      actions: [
        {
          label: "Undo",
          onClick: () => {
            setRows(before)
            setResult(undefined)
          }
        }
      ]
    })
  }
  const statuses = countOf(selected, (row) => row.status)
  const [shared] = statuses.size === 1 ? [...statuses.keys()] : []
  const next =
    shared === undefined ? undefined : STATUSES[STATUSES.indexOf(shared) + 1]
  return {
    rows,
    selected,
    picked,
    toggle: (id: string, on: boolean) => {
      setResult(undefined)
      setPicked((current) => {
        const copy = new Set(current)
        if (on) copy.add(id)
        else copy.delete(id)
        return copy
      })
    },
    clear: () => setPicked(new Set()),
    selectAll: () => setPicked(new Set(rows.map((row) => row.id))),
    targetsOf,
    edit,
    result,
    taught,
    // The next status, when every selected ticket shares one.
    nextStatus: selected.length > 1 ? next : undefined,
    applyNext: () => {
      if (next === undefined) return
      edit(
        selected.map((row) => row.id),
        (row) => ({ ...row, status: next })
      )
    }
  }
}

// The suggested row: the bar's warm dot, which screen readers hear.
function Suggested() {
  return (
    <span className="flex shrink-0 items-center">
      <span aria-hidden className="size-1.5 rounded-full bg-state-warning" />
      <span className="sr-only">Suggested</span>
    </span>
  )
}

function Count({ value }: Readonly<{ value: number }>) {
  return (
    <span
      data-menu-meta
      className="shrink-0 text-caption text-muted-foreground tabular-nums"
    >
      {value}
    </span>
  )
}

// As the menu opens, its highlight starts on the suggested row (after the
// menu's own start on the checked row), so Enter takes the suggestion.
function StartOnSuggested() {
  const ref = React.useRef<HTMLSpanElement>(null)
  React.useLayoutEffect(() => {
    let live = true
    queueMicrotask(() =>
      queueMicrotask(() =>
        queueMicrotask(() => {
          const row =
            ref.current?.parentElement?.querySelector<HTMLElement>(
              "[data-suggested]"
            )
          if (live) row?.closest<HTMLElement>("[role=menuitemradio]")?.focus()
        })
      )
    )
    return () => {
      live = false
    }
  }, [])
  return <span ref={ref} hidden />
}

type Option = Readonly<{
  value: string
  label: string
  icon: React.ReactNode
  count: number
}>

// A menu of values that applies the pick at once.
function PickMenu({
  trigger,
  options,
  current,
  suggested,
  open,
  onOpenChange,
  onPick,
  title,
  heading
}: Readonly<{
  trigger: React.ReactElement
  options: ReadonlyArray<Option>
  current: string | null
  suggested?: string
  open: boolean
  onOpenChange: (open: boolean) => void
  onPick: (value: string) => void
  title: string
  // Says what it changes when that's more than one ticket.
  heading?: string
}>) {
  return (
    <DropdownMenu open={open} onOpenChange={onOpenChange}>
      <DropdownMenuTrigger render={trigger} />
      <DropdownMenuContent
        align="start"
        sideOffset={6}
        className="w-60"
        aria-label={title}
      >
        {suggested !== undefined && <StartOnSuggested />}
        {/* A group, so its heading labels it (Base UI wants a label in one). */}
        <DropdownMenuGroup>
          {heading !== undefined && (
            <DropdownMenuLabel>{heading}</DropdownMenuLabel>
          )}
          <DropdownMenuRadioGroup
            value={current}
            onValueChange={onPick}
            items={options.map((option) => ({
              value: option.value,
              textValue: option.label,
              // A pick applies and closes: two clicks in all.
              closeOnClick: true,
              label: (
                <>
                  {option.icon}
                  <span className="min-w-0 truncate">{option.label}</span>
                  <Count value={option.count} />
                  {option.value === suggested && (
                    <span data-suggested className="flex">
                      <Suggested />
                    </span>
                  )}
                </>
              )
            }))}
          />
        </DropdownMenuGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

// A lit property: the same one on every selected row.
const LIT = "bg-active"

const fieldButton =
  "focus-ring grid size-6 cursor-pointer place-items-center rounded-md transition-colors hover:bg-hover"

// A row's property menus, each changing the row's targets.
export function useRowMenus(
  lab: ListLab,
  row: DemoTicket,
  open: Field | null,
  setOpen: (field: Field | null) => void,
  lit: Field | null,
  onLight: (field: Field | null) => void
) {
  const targets = lab.targetsOf(row.id)
  const ids = targets.map((each) => each.id)
  const many = targets.length > 1
  // Hovering (or focusing) a selected row's property lights the same one on
  // every selected row: what you're about to change, before you click.
  const light = (field: Field) =>
    many
      ? {
          onPointerEnter: () => onLight(field),
          onPointerLeave: () => onLight(null),
          onFocus: () => onLight(field),
          onBlur: () => onLight(null)
        }
      : {}
  const litClass = (field: Field) => many && lit === field && LIT
  const heading = (name: string) =>
    many ? `${name} · ${targets.length} tickets` : undefined
  const menu = (field: Field) => ({
    open: open === field,
    onOpenChange: (next: boolean) => setOpen(next ? field : null)
  })
  const sharedOf = <V,>(values: ReadonlyArray<V>) =>
    new Set(values).size === 1 ? (values[0] ?? null) : null
  const title = (name: string) =>
    many ? `${name} for ${targets.length} tickets` : name

  const statuses = countOf(targets, (each) => each.status)
  const status = (
    <PickMenu
      {...menu("status")}
      title={title("Status")}
      heading={heading("Status")}
      trigger={
        <button
          type="button"
          aria-label={`Status: ${STATUS[row.status].label}`}
          aria-keyshortcuts="S"
          {...light("status")}
          className={cn(fieldButton, litClass("status"))}
        >
          {React.createElement(STATUS[row.status].icon, {
            className: cn("size-4", STATUS[row.status].className),
            strokeWidth: 1.75
          })}
        </button>
      }
      current={sharedOf(targets.map((each) => each.status))}
      suggested={many && lab.picked.has(row.id) ? lab.nextStatus : undefined}
      options={STATUSES.map((value) => ({
        value,
        label: STATUS[value].label,
        icon: React.createElement(STATUS[value].icon, {
          className: STATUS[value].className
        }),
        count: statuses.get(value) ?? 0
      }))}
      onPick={(value) =>
        lab.edit(ids, (each) => ({
          ...each,
          status: value as DemoTicket["status"]
        }))
      }
    />
  )

  const priorities = countOf(targets, (each) => each.priority)
  const priority = (
    <PickMenu
      {...menu("priority")}
      title={title("Priority")}
      heading={heading("Priority")}
      trigger={
        <button
          type="button"
          aria-label={`Priority: ${PRIORITY[row.priority].label}`}
          aria-keyshortcuts="P"
          {...light("priority")}
          className={cn(fieldButton, litClass("priority"))}
        >
          {React.createElement(PRIORITY[row.priority].icon, {
            className: cn("size-3.5", PRIORITY[row.priority].className),
            strokeWidth: 1.75
          })}
        </button>
      }
      current={sharedOf(targets.map((each) => each.priority))}
      options={PRIORITIES.map((value) => ({
        value,
        label: PRIORITY[value].label,
        icon: React.createElement(PRIORITY[value].icon, {
          className: PRIORITY[value].className
        }),
        count: priorities.get(value) ?? 0
      }))}
      onPick={(value) =>
        lab.edit(ids, (each) => ({
          ...each,
          priority: value as DemoTicket["priority"]
        }))
      }
    />
  )

  const people = countOf(targets, (each) => each.assignee?.id ?? "none")
  const assignee = (
    <PickMenu
      {...menu("assignee")}
      title={title("Assignee")}
      heading={heading("Assignee")}
      trigger={
        <button
          type="button"
          aria-label={
            row.assignee ? `Assignee: ${row.assignee.name}` : "Assign"
          }
          aria-keyshortcuts="A"
          {...light("assignee")}
          className={cn(
            "focus-ring grid min-h-6 min-w-6 cursor-pointer place-items-center rounded-full",
            litClass("assignee") && "ring-2 ring-border"
          )}
        >
          {row.assignee ? (
            <MemberAvatar member={row.assignee} size={20} />
          ) : (
            <span
              className={cn(
                "grid size-5 place-items-center rounded-full text-muted-foreground shadow-[inset_0_0_0_1px_var(--border)] corner-squircle",
                // A selected row shows every slot, so you see where it goes.
                !lab.picked.has(row.id) &&
                  "opacity-0 group-hover/reveal:opacity-100"
              )}
            >
              <User className="size-3" strokeWidth={1.75} />
            </span>
          )}
        </button>
      }
      current={sharedOf(targets.map((each) => each.assignee?.id ?? "none"))}
      options={[
        ...PEOPLE.map((person) => ({
          value: person.id,
          label: person.name,
          icon: <MemberAvatar member={person} size={16} />,
          count: people.get(person.id) ?? 0
        })),
        {
          value: "none",
          label: "Unassigned",
          icon: <User />,
          count: people.get("none") ?? 0
        }
      ]}
      onPick={(value) =>
        lab.edit(ids, (each) => ({
          ...each,
          assignee: PEOPLE.find((person) => person.id === value)
        }))
      }
    />
  )

  const sprints = countOf(targets, (each) => each.sprint ?? "none")
  const sprint = (
    <PickMenu
      {...menu("sprint")}
      title={title("Sprint")}
      heading={heading("Sprint")}
      trigger={
        <Chip
          interaction="press"
          aria-label={row.sprint ? `Sprint: ${row.sprint}` : "Add to sprint"}
          aria-keyshortcuts="Shift+S"
          {...light("sprint")}
          className={cn(
            "max-w-[14ch] gap-1",
            many && lit === "sprint" && LIT,
            !row.sprint &&
              "text-muted-foreground opacity-0 group-hover/reveal:opacity-100",
            !row.sprint && lab.picked.has(row.id) && "opacity-100"
          )}
        >
          <Flag className="size-3 shrink-0" strokeWidth={1.75} />
          <span className="truncate">{row.sprint ?? "Sprint"}</span>
        </Chip>
      }
      current={sharedOf(targets.map((each) => each.sprint ?? "none"))}
      options={[
        ...SPRINTS.map((value) => ({
          value,
          label: value,
          icon: <Flag className="text-state-info" />,
          count: sprints.get(value) ?? 0
        })),
        {
          value: "none",
          label: "No sprint",
          icon: <Zap />,
          count: sprints.get("none") ?? 0
        }
      ]}
      onPick={(value) =>
        lab.edit(ids, ({ sprint: _, ...each }) =>
          value === "none" ? each : { ...each, sprint: value }
        )
      }
    />
  )

  // Labels toggle one at a time, each applying at once; a label on some of
  // the selection is mixed (a dash), and a click puts it on all of them.
  const tagCount = (name: string) =>
    targets.filter((each) => each.tags?.some((tag) => tag.name === name)).length
  const rowTags = row.tags ?? []
  const labels = (
    <DropdownMenu {...menu("labels")}>
      <DropdownMenuTrigger
        render={
          <button
            type="button"
            aria-label={
              rowTags.length > 0
                ? `Labels: ${rowTags.map((tag) => tag.name).join(", ")}`
                : "Add label"
            }
            aria-keyshortcuts="T"
            {...light("labels")}
            // The list's own label chips (up to three, then "+N", folding
            // to dots and a count on a narrow list), as one target.
            className={cn(
              "focus-ring flex cursor-pointer items-center gap-1.5 rounded-[12px]",
              litClass("labels") && "[&>span]:bg-active",
              rowTags.length === 0 &&
                !lab.picked.has(row.id) &&
                "opacity-0 group-hover/reveal:opacity-100"
            )}
          >
            {rowTags.length === 0 ? (
              <Chip className="gap-1 text-muted-foreground">
                <Tag className="size-3" strokeWidth={1.75} />
                Label
              </Chip>
            ) : (
              <>
                {rowTags.slice(0, 3).map((tag) => (
                  <Chip
                    key={tag.name}
                    kind="label"
                    show="wide"
                    className="max-w-32"
                  >
                    <span
                      aria-hidden
                      className="size-2 shrink-0 rounded-full"
                      style={{ backgroundColor: tag.color }}
                    />
                    <span className="truncate">{tag.name}</span>
                  </Chip>
                ))}
                {rowTags.length > 3 && (
                  <Chip kind="label" show="wide">
                    +{rowTags.length - 3}
                  </Chip>
                )}
                <Chip kind="label" show="narrow">
                  <ChipDots colors={rowTags.map((tag) => tag.color)} />
                  {rowTags.length}
                </Chip>
              </>
            )}
          </button>
        }
      />
      <DropdownMenuContent
        align="start"
        sideOffset={6}
        className="w-60"
        aria-label={title("Labels")}
      >
        <DropdownMenuGroup>
          {many && <DropdownMenuLabel>{heading("Labels")}</DropdownMenuLabel>}
          {TAGS.map((tag) => {
            const count = tagCount(tag.name)
            const on = count === targets.length
            return (
              <DropdownMenuCheckboxItem
                key={tag.name}
                checked={on}
                mixed={count > 0 && !on}
                label={tag.name}
                closeOnClick={false}
                onCheckedChange={() =>
                  lab.edit(ids, (each) => {
                    const rest = (each.tags ?? []).filter(
                      (have) => have.name !== tag.name
                    )
                    return { ...each, tags: on ? rest : [...rest, tag] }
                  })
                }
              >
                <span
                  aria-hidden
                  className="size-2 shrink-0 rounded-full"
                  style={{ backgroundColor: tag.color }}
                />
                <span className="min-w-0 truncate">{tag.name}</span>
                <Count value={count} />
              </DropdownMenuCheckboxItem>
            )
          })}
        </DropdownMenuGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  )

  return { status, priority, assignee, sprint, labels }
}
