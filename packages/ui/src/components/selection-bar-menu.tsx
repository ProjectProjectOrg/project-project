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
}>

// How many of the selection have a value: "3", or once a change to it is
// staged, "2 → 11". A value the staged pick takes away from dims instead of
// counting down, so only the change you made reads loudly.
function Count({
  now,
  next,
  dim = false
}: Readonly<{ now: number; next: number; dim?: boolean }>) {
  const changed = !dim && now !== next
  return (
    <>
      <span aria-hidden className="flex-1" />
      <span
        data-menu-meta
        className={cn(
          "shrink-0 pl-3 text-caption whitespace-nowrap tabular-nums transition-[color,opacity] duration-150",
          changed ? "text-foreground" : "text-muted-foreground",
          dim && "opacity-40"
        )}
      >
        <TextSwap speed="fast">
          {changed ? `${now} → ${next}` : String(now)}
        </TextSwap>
      </span>
    </>
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
  onApply
}: Readonly<{ label: string; disabled: boolean; onApply: () => void }>) {
  return (
    <MenuPrimitive.Item
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
  onApply,
  onOpenChange,
  children
}: MenuShellProps &
  Readonly<{
    staged: boolean
    onApply: () => void
    onOpenChange: (open: boolean) => void
    children: React.ReactNode
  }>) {
  return (
    <DropdownMenu filterable={search !== undefined} onOpenChange={onOpenChange}>
      <DropdownMenuTrigger render={trigger} />
      <DropdownMenuContent
        align="start"
        sideOffset={8}
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
        <ApplyItem label={applyLabel} disabled={!staged} onApply={onApply} />
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

// Sets one value on every selected ticket. The radio starts on the value
// they share, or on nothing when they differ.
export function SelectionBarPickMenu<V extends string>({
  options,
  total,
  onApply,
  ...shell
}: MenuShellProps &
  Readonly<{
    options: ReadonlyArray<SelectionBarMenuOption<V>>
    onApply: (value: V) => void
  }>) {
  const shared = options.find((option) => option.count === total)?.value
  const [staged, setStaged] = React.useState<V | null>(null)
  const change = staged !== null && staged !== shared ? staged : null
  return (
    <MenuShell
      {...shell}
      total={total}
      staged={change !== null}
      onApply={() => {
        if (change !== null) onApply(change)
      }}
      onOpenChange={() => setStaged(null)}
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
  onApply,
  ...shell
}: MenuShellProps &
  Readonly<{
    options: ReadonlyArray<SelectionBarMenuOption<V>>
    onApply: (change: Readonly<{ add: Array<V>; remove: Array<V> }>) => void
  }>) {
  const [staged, setStaged] = React.useState<ReadonlyMap<V, Toggle>>(
    () => new Map()
  )
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
      onOpenChange={() => setStaged(new Map())}
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
          </DropdownMenuCheckboxItem>
        )
      })}
    </MenuShell>
  )
}
