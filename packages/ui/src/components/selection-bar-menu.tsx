import { Menu as MenuPrimitive } from "@base-ui/react/menu"
import * as React from "react"

import { cn } from "../lib/utils"
import { buttonVariants } from "./button"
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuEmpty,
  DropdownMenuInput,
  DropdownMenuList,
  DropdownMenuRadioGroup,
  DropdownMenuSeparator,
  DropdownMenuTrigger
} from "./dropdown-menu"
import { TextSwap } from "./text-swap"

/*
 * The selection bar's menus. A pick here changes every selected ticket, so
 * it's staged first: the menu stays open, each value says how many of the
 * selection have it, a staged change says what it will become ("2 → 11"),
 * and Apply commits the lot. Escape, or closing the menu any other way,
 * drops what was staged.
 *
 *   <SelectionBarPickMenu trigger={<SelectionBarField … />} total={11}
 *     options={[{ value: "todo", textValue: "Todo", icon: <…/>, count: 2 }, …]}
 *     applyLabel="Apply to 11 tickets" onApply={(status) => …} />
 *
 * SelectionBarPickMenu sets one value (status, priority, sprint);
 * SelectionBarToggleMenu adds and removes values (labels, assignees), each
 * checked on all, none, or (mixed) some of the selection.
 */

export type SelectionBarMenuOption<V extends string> = Readonly<{
  value: V
  // Its icon, before the name.
  icon?: React.ReactNode
  // Its name: shown (cut short with an ellipsis when it's long), and used
  // for type-ahead and the search.
  textValue: string
  // How many selected tickets have it now.
  count: number
}>

type MenuShellProps = Readonly<{
  // The bar's field; the menu opens from it.
  trigger: React.ReactElement
  // How many tickets are selected.
  total: number
  // The Apply button: "Apply to 11 tickets".
  applyLabel: string
  className?: string
  // A search field over the options (labels, people), with what it says
  // when nothing matches.
  search?: Readonly<{ placeholder: string; empty: string }>
  // Below the options: a search's "Create …" row.
  extra?: React.ReactNode
  // Open it from outside too (the field's key, pressed anywhere in the
  // list); leave it out and the field alone opens it.
  open?: boolean
  onOpenChange?: (open: boolean) => void
  // Where it opens from, when not its field (a field the bar has no room
  // for opens from the bar's overflow menu).
  anchor?: React.ComponentProps<typeof DropdownMenuContent>["anchor"]
}>

// How many of the selection have a value: "3", or once a change to it is
// staged, "2 → 11". A value the staged pick takes away from dims instead of
// counting down, so only the change you made reads loudly. It follows the
// name, so the row's own key (1, 2, 3 in a pick menu) keeps the far end.
function Count({
  now,
  next,
  dim = false
}: Readonly<{ now: number; next: number; dim?: boolean }>) {
  const changed = !dim && now !== next
  return (
    <span
      data-menu-meta
      className={cn(
        "shrink-0 text-caption whitespace-nowrap tabular-nums transition-[color,opacity] duration-150",
        changed ? "text-foreground" : "text-muted-foreground",
        dim && "opacity-40"
      )}
    >
      <TextSwap speed="fast">
        {changed ? `${now} → ${next}` : String(now)}
      </TextSwap>
    </span>
  )
}

// The mark on the row a field suggests: the field's own warm dot, so the
// two read as one; screen readers hear its label ("Suggested").
function SuggestedNote({ label }: Readonly<{ label: string }>) {
  return (
    <span className="flex shrink-0 items-center">
      <span aria-hidden className="size-1.5 rounded-full bg-state-warning" />
      <span className="sr-only">{label}</span>
    </span>
  )
}

// An option's icon and name; a long name ends in an ellipsis so the count
// beside it never wraps.
function OptionName({
  option
}: Readonly<{ option: SelectionBarMenuOption<string> }>) {
  return (
    <>
      {option.icon}
      <span className="min-w-0 truncate">{option.textValue}</span>
    </>
  )
}

// The menu's last row: commits what's staged. A menu item, so the arrow
// keys reach it and Enter presses it; dimmed until something is staged.
// The menu highlights the row under the pointer too, so the ring follows
// focus-visible (the keyboard), and hover is the button's own darker fill.
function ApplyItem({
  label,
  disabled,
  start,
  onApply
}: Readonly<{
  label: string
  disabled: boolean
  // The menu opens on it (a suggestion is staged), so Enter applies it.
  start: boolean
  onApply: () => void
}>) {
  const ref = React.useRef<HTMLDivElement>(null)
  React.useLayoutEffect(() => {
    if (!start) return undefined
    let live = true
    // As the menu opens (it mounts then), after the menu's own start (its
    // first or checked row, two microtasks in), so this one wins.
    queueMicrotask(() =>
      queueMicrotask(() =>
        queueMicrotask(() => {
          if (live) ref.current?.focus()
        })
      )
    )
    return () => {
      live = false
    }
  }, [start])
  return (
    <MenuPrimitive.Item
      ref={ref}
      data-slot="selection-bar-apply"
      disabled={disabled}
      onClick={onApply}
      className={cn(
        buttonVariants({ variant: "primary", size: "md" }),
        "mt-1 w-full rounded-[16px] [corner-shape:var(--button-corner)] focus-visible:ring-2 focus-visible:ring-ring/50 focus-visible:ring-offset-1 focus-visible:ring-offset-card data-[disabled]:cursor-not-allowed data-[disabled]:opacity-40"
      )}
    >
      {label}
    </MenuPrimitive.Item>
  )
}

function MenuShell({
  trigger,
  applyLabel,
  className,
  search,
  extra,
  staged,
  startOnApply = false,
  onApply,
  open,
  onOpenChange,
  onReset,
  anchor,
  children
}: MenuShellProps &
  Readonly<{
    staged: boolean
    startOnApply?: boolean
    onApply: () => void
    // Drops what's staged; runs on every open and close.
    onReset: () => void
    children: React.ReactNode
  }>) {
  return (
    <DropdownMenu
      filterable={search !== undefined}
      open={open}
      onOpenChange={(next) => {
        onReset()
        onOpenChange?.(next)
      }}
    >
      <DropdownMenuTrigger render={trigger} />
      <DropdownMenuContent
        align="start"
        sideOffset={8}
        anchor={anchor}
        className={cn("w-64", className)}
      >
        {search === undefined ? (
          children
        ) : (
          <>
            <DropdownMenuInput
              placeholder={search.placeholder}
              aria-label={search.placeholder}
            />
            <DropdownMenuList className="max-h-72 overflow-y-auto">
              {children}
            </DropdownMenuList>
            <DropdownMenuEmpty>{search.empty}</DropdownMenuEmpty>
          </>
        )}
        {extra}
        <DropdownMenuSeparator />
        <ApplyItem
          label={applyLabel}
          disabled={!staged}
          start={startOnApply}
          onApply={onApply}
        />
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

// Sets one value on every selected ticket. The radio starts on the value
// they share, or on nothing when they differ.
export function SelectionBarPickMenu<V extends string>({
  options,
  total,
  suggested,
  onApply,
  ...shell
}: MenuShellProps &
  Readonly<{
    options: ReadonlyArray<SelectionBarMenuOption<V>>
    // The value it suggests for the selection, staged whenever it opens,
    // and its row's note ("Suggested").
    suggested?: Readonly<{ value: V; label: string }>
    onApply: (value: V) => void
  }>) {
  const shared = options.find((option) => option.count === total)?.value
  const start = suggested?.value ?? null
  const [staged, setStaged] = React.useState<V | null>(start)
  const change = staged !== null && staged !== shared ? staged : null
  return (
    <MenuShell
      {...shell}
      total={total}
      staged={change !== null}
      onApply={() => {
        if (change !== null) onApply(change)
      }}
      startOnApply={start !== null}
      onReset={() => setStaged(start)}
    >
      <DropdownMenuRadioGroup
        value={staged ?? shared ?? null}
        onValueChange={(next) => setStaged(next)}
        items={options.map((option) => ({
          value: option.value,
          textValue: option.textValue,
          closeOnClick: false,
          label: (
            <>
              <OptionName option={option} />
              <Count
                now={option.count}
                next={option.value === change ? total : option.count}
                dim={change !== null && option.value !== change}
              />
              {suggested?.value === option.value && (
                <SuggestedNote label={suggested.label} />
              )}
            </>
          )
        }))}
      />
    </MenuShell>
  )
}

type Toggle = "on" | "off"
type ToggleState = Toggle | "mixed"

const stateOf = (count: number, total: number) =>
  (count === 0 ? "off" : count === total ? "on" : "mixed") satisfies ToggleState

// Adds or removes values on every selected ticket. Each value is checked
// on all of them, unchecked on none, or mixed; a click moves a mixed value
// on, then off, then back to mixed (on and off just swap).
export function SelectionBarToggleMenu<V extends string>({
  options,
  total,
  suggested,
  onApply,
  ...shell
}: MenuShellProps &
  Readonly<{
    options: ReadonlyArray<SelectionBarMenuOption<V>>
    // The values it suggests adding (assign to me), staged whenever it
    // opens, and their rows' note ("Suggested").
    suggested?: Readonly<{ add: ReadonlyArray<V>; label: string }>
    onApply: (change: Readonly<{ add: Array<V>; remove: Array<V> }>) => void
  }>) {
  const start = () =>
    new Map<V, Toggle>((suggested?.add ?? []).map((value) => [value, "on"]))
  const [staged, setStaged] = React.useState<ReadonlyMap<V, Toggle>>(start)
  const cycle = (option: SelectionBarMenuOption<V>) =>
    setStaged((current) => {
      const start = stateOf(option.count, total)
      const now = current.get(option.value) ?? start
      const after = new Map<ToggleState, ToggleState>([
        ["mixed", "on"],
        ["on", "off"],
        ["off", start === "mixed" ? "mixed" : "on"]
      ])
      const next = after.get(now) ?? start
      const map = new Map(current)
      if (next === start || next === "mixed") map.delete(option.value)
      else map.set(option.value, next)
      return map
    })
  const changes = [...staged]
  return (
    <MenuShell
      {...shell}
      total={total}
      staged={staged.size > 0}
      onApply={() =>
        onApply({
          add: changes.flatMap(([value, to]) => (to === "on" ? [value] : [])),
          remove: changes.flatMap(([value, to]) =>
            to === "off" ? [value] : []
          )
        })
      }
      onReset={() => setStaged(start())}
    >
      {options.map((option) => {
        const to = staged.get(option.value)
        const state = to ?? stateOf(option.count, total)
        return (
          <DropdownMenuCheckboxItem
            key={option.value}
            checked={state === "on"}
            mixed={state === "mixed"}
            label={option.textValue}
            closeOnClick={false}
            onCheckedChange={() => cycle(option)}
          >
            <OptionName option={option} />
            <Count
              now={option.count}
              next={to === undefined ? option.count : to === "on" ? total : 0}
            />
            {suggested?.add.includes(option.value) === true && (
              <SuggestedNote label={suggested.label} />
            )}
          </DropdownMenuCheckboxItem>
        )
      })}
    </MenuShell>
  )
}
