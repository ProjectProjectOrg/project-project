import { Button } from "@pp/ui/button"
import { CommandMenuFooter, CommandMenuFooterHint } from "@pp/ui/command-menu"
import { ArrowRight, Minus, Plus } from "@pp/ui/icons"
import { KbdShortcut } from "@pp/ui/kbd"
import { useState, type ReactNode } from "react"

import { keyLabels } from "@/lib/keyLabels"

/*
 * A change to several tickets waits in ⌘K until it's applied: the page
 * stages it (Enter picks or toggles), this says what it will do, one line
 * per group of tickets ("3  Todo → Done"), and Apply (or Mod+Enter) sends
 * it.
 */

export type StagedLine = Readonly<{
  key: string
  count: number
  change: ReactNode
}>

export function StagedChanges({
  lines,
  hint,
  applyLabel,
  onApply
}: Readonly<{
  lines: ReadonlyArray<StagedLine>
  // What Enter does on the page: "Choose" or "Toggle".
  hint: string
  applyLabel: string
  onApply: () => void
}>) {
  return (
    <div className="border-t border-border/60">
      {lines.length > 0 && (
        <ul className="flex flex-col gap-1 px-4 pt-2.5 pb-0.5 text-body">
          {lines.map((line) => (
            <li key={line.key} className="flex min-w-0 items-center gap-2">
              <span className="w-5 shrink-0 text-right text-caption text-muted-foreground tabular-nums">
                {line.count}
              </span>
              {line.change}
            </li>
          ))}
        </ul>
      )}
      <CommandMenuFooter>
        <CommandMenuFooterHint
          label={hint}
          keys="Enter"
          keyLabels={keyLabels()}
        />
        <Button
          type="button"
          variant="tertiary"
          size="xs"
          className="ml-auto"
          disabled={lines.length === 0}
          onClick={onApply}
        >
          {applyLabel}
          <KbdShortcut size="sm" keys="mod+enter" keyLabels={keyLabels()} />
        </Button>
      </CommandMenuFooter>
    </div>
  )
}

// A row's count in a staged page: how many of the selection hold it now.
export function StagedRowCount({ count }: Readonly<{ count?: number }>) {
  return count === undefined ? null : (
    <span className="text-caption text-muted-foreground tabular-nums">
      {count}
    </span>
  )
}

// How many tickets a pick changes (each is on one line), or, before
// anything is staged, the whole selection.
export const stagedCount = (
  lines: ReadonlyArray<StagedLine>,
  selected: number
) =>
  lines.length === 0
    ? selected
    : lines.reduce((sum, line) => sum + line.count, 0)

// One value, as a line shows it: its icon and name.
export function StagedValue({
  icon,
  label
}: Readonly<{ icon: ReactNode; label: string }>) {
  return (
    <span className="flex min-w-0 items-center gap-1.5 [&_svg]:size-3.5 [&_svg]:shrink-0">
      {icon}
      <span className="truncate">{label}</span>
    </span>
  )
}

// A pick's line: what the tickets hold now, and what they'll hold.
export function StagedMove({
  from,
  to
}: Readonly<{ from: ReactNode; to: ReactNode }>) {
  return (
    <span className="flex min-w-0 items-center gap-2">
      {from}
      <ArrowRight
        className="size-3.5 shrink-0 text-muted-foreground"
        strokeWidth={1.75}
      />
      {to}
    </span>
  )
}

// A toggle's line: the value added to, or removed from, the tickets.
export function StagedToggle({
  on,
  children
}: Readonly<{ on: boolean; children: ReactNode }>) {
  const Icon = on ? Plus : Minus
  return (
    <span className="flex min-w-0 items-center gap-2">
      <Icon
        className="size-3.5 shrink-0 text-muted-foreground"
        strokeWidth={1.75}
      />
      {children}
    </span>
  )
}

const CHECKED = { all: true, some: "mixed", none: false } as const

// Toggles staged over several tickets' lists (labels, assignees). A value
// starts as the tickets hold it: on every one, some, or none. Toggling
// turns it on for all, then off for all, then (if some held it) back to
// how it was.
export function useStagedToggles<V extends string>(
  lists: ReadonlyArray<ReadonlyArray<V>>
) {
  const [staged, setStaged] = useState<ReadonlyMap<V, boolean>>(new Map())
  const held = (value: V) => lists.filter((list) => list.includes(value)).length
  const original = (value: V) => {
    const count = held(value)
    return count === 0 ? "none" : count === lists.length ? "all" : "some"
  }
  const shown = (value: V) => {
    const on = staged.get(value)
    return on === undefined ? original(value) : on ? "all" : "none"
  }
  const toggle = (value: V) => {
    const now = shown(value)
    const next =
      now === "all"
        ? "none"
        : now === "none" && original(value) === "some"
          ? "some"
          : "all"
    const map = new Map(staged)
    if (next === original(value)) map.delete(value)
    else map.set(value, next === "all")
    setStaged(map)
  }
  const changes = [...staged].map(([value, on]) => ({
    value,
    on,
    count: on ? lists.length - held(value) : held(value)
  }))
  const affected = lists.filter((list) =>
    changes.some(({ value, on }) => list.includes(value) !== on)
  ).length
  return {
    // A row's check: on every ticket, some (a dash), or none.
    checked: (value: V) => CHECKED[shown(value)],
    // How many of the tickets hold it now (none: no count).
    held: (value: V) => held(value) || undefined,
    toggle,
    changes,
    add: changes.flatMap(({ value, on }) => (on ? [value] : [])),
    remove: changes.flatMap(({ value, on }) => (on ? [] : [value])),
    // How many tickets the staged toggles change, or, before any, all.
    affected: affected === 0 ? lists.length : affected
  }
}
