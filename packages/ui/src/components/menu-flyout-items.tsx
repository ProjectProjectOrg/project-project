import type { BaseUIEvent } from "@base-ui/react"
import type { Menu as MenuPrimitive } from "@base-ui/react/menu"
import { useRender } from "@base-ui/react/use-render"
import * as React from "react"

import { useMenuControl } from "../lib/menuClose"
import { FlyoutFilterContext, changeDetails } from "./menu-flyout"

type RowRole = "menuitem" | "menuitemcheckbox" | "menuitemradio"

type PartProps<Part extends React.ElementType> = Omit<
  React.ComponentProps<Part>,
  "className" | "style" | "render"
> &
  Readonly<{
    className?: unknown
    style?: unknown
    render?: unknown
  }>

const classOf = (className: unknown) =>
  typeof className === "string" ? className : undefined

const styleOf = (style: unknown) =>
  typeof style === "object" && style !== null
    ? (style as React.CSSProperties)
    : undefined

function plainOnly(part: string, render: unknown) {
  if (render !== undefined)
    throw new Error(`${part} takes no render prop inside a flyout submenu`)
}

const checkedAttributes = (checked: boolean) => ({
  "data-checked": checked ? "" : undefined,
  "data-unchecked": checked ? undefined : ""
})

const FlyoutCheckedContext = React.createContext(false)

const FlyoutRadioContext = React.createContext<Readonly<{
  value: unknown
  pick: (value: string, event: Event) => void
}> | null>(null)

const noSubscribe = () => () => {}

function asBaseUIEvent<E extends React.SyntheticEvent>(event: E) {
  let prevented = false
  return Object.defineProperties(event, {
    preventBaseUIHandler: {
      value: () => {
        prevented = true
      }
    },
    baseUIHandlerPrevented: { get: () => prevented }
  }) as BaseUIEvent<E>
}

const childrenText: (children: React.ReactNode) => string = (children) => {
  if (typeof children === "string" || typeof children === "number")
    return String(children)
  if (Array.isArray(children)) return children.map(childrenText).join("")
  if (React.isValidElement<{ children?: React.ReactNode }>(children))
    return childrenText(children.props.children)
  return ""
}

function useFilterMatch(label: string | undefined, children: React.ReactNode) {
  const filter = React.use(FlyoutFilterContext)
  const id = React.useId()
  const matched =
    filter === null || filter.matches(label ?? childrenText(children))
  const store = filter?.store
  React.useLayoutEffect(() => {
    if (store === undefined) return undefined
    store.set(id, matched)
    return () => store.set(id, null)
  }, [store, id, matched])
  return matched
}

type ItemProps = Omit<
  React.ComponentProps<typeof MenuPrimitive.Item>,
  "role" | "closeOnClick" | "className" | "style" | "render"
> &
  Readonly<{ className?: unknown; style?: unknown; render?: unknown }>

type RowState = Readonly<{ disabled: boolean; highlighted: boolean }>

const byState = <T,>(value: unknown, state: RowState) =>
  typeof value === "function" ? (value as (state: RowState) => T)(state) : value

type RowProps = ItemProps &
  Readonly<{
    role: RowRole
    closeOnClick: boolean
    onActivate?: (event: React.MouseEvent<HTMLElement>) => void
  }>

function FlyoutRow({
  role,
  label,
  disabled = false,
  closeOnClick,
  onClick,
  onActivate,
  render,
  className,
  style,
  nativeButton: _nativeButton,
  id,
  ref,
  children,
  ...rest
}: RowProps) {
  const ownId = React.useId()
  const matched = useFilterMatch(label, children)
  const menu = useMenuControl()
  const state = { disabled, highlighted: false }
  const element = useRender({
    render: render as useRender.RenderProp<RowState> | undefined,
    state,
    ref,
    defaultTagName: "div",
    props: {
      ...rest,
      id: id ?? ownId,
      role,
      "aria-disabled": disabled || undefined,
      "data-disabled": disabled ? "" : undefined,
      "data-label": label,
      className: classOf(byState(className, state)),
      style: styleOf(byState(style, state)),
      children,
      onClick: (event: React.MouseEvent<HTMLDivElement>) => {
        if (disabled) return
        const press = asBaseUIEvent(event)
        onClick?.(press)
        onActivate?.(event)
        if (closeOnClick && !press.baseUIHandlerPrevented)
          menu.close({ picked: true })
      }
    }
  })
  return matched ? element : null
}

export function FlyoutItem({
  closeOnClick = true,
  ...props
}: ItemProps & {
  closeOnClick?: boolean
}) {
  return <FlyoutRow role="menuitem" closeOnClick={closeOnClick} {...props} />
}

type CheckboxProps = Omit<
  React.ComponentProps<typeof MenuPrimitive.CheckboxItem>,
  "role" | "className" | "style" | "render"
> &
  Readonly<{ className?: unknown; style?: unknown; render?: unknown }>

export function FlyoutCheckboxItem({
  checked = false,
  defaultChecked: _defaultChecked,
  onCheckedChange,
  mixed,
  closeOnClick = false,
  children,
  ...props
}: CheckboxProps & Readonly<{ mixed: boolean }>) {
  return (
    <FlyoutRow
      aria-checked={mixed ? "mixed" : checked}
      {...checkedAttributes(checked)}
      {...props}
      role="menuitemcheckbox"
      closeOnClick={closeOnClick}
      onActivate={(event) =>
        onCheckedChange?.(
          !checked,
          changeDetails("item-press", event.nativeEvent)
        )
      }
    >
      <FlyoutCheckedContext value={checked}>{children}</FlyoutCheckedContext>
    </FlyoutRow>
  )
}

export function FlyoutRadioGroup({
  value,
  defaultValue: _defaultValue,
  onValueChange,
  disabled: _disabled,
  render,
  className,
  style,
  children,
  ...props
}: PartProps<typeof MenuPrimitive.RadioGroup>) {
  plainOnly("DropdownMenuRadioGroup", render)
  const group = React.useMemo(
    () => ({
      value,
      pick: (next: string, event: Event) =>
        onValueChange?.(next, changeDetails("item-press", event))
    }),
    [value, onValueChange]
  )
  return (
    <FlyoutRadioContext value={group}>
      <div
        {...props}
        role="group"
        className={classOf(className)}
        style={styleOf(style)}
      >
        {children}
      </div>
    </FlyoutRadioContext>
  )
}

type RadioProps = Omit<
  React.ComponentProps<typeof MenuPrimitive.RadioItem>,
  "role" | "value" | "className" | "style" | "render"
> &
  Readonly<{
    value: string
    className?: unknown
    style?: unknown
    render?: unknown
  }>

export function FlyoutRadioItem({
  value,
  closeOnClick = false,
  children,
  ...props
}: RadioProps) {
  const group = React.use(FlyoutRadioContext)
  const checked = group !== null && group.value === value
  return (
    <FlyoutRow
      aria-checked={checked}
      {...checkedAttributes(checked)}
      {...props}
      role="menuitemradio"
      closeOnClick={closeOnClick}
      onActivate={(event) => group?.pick(value, event.nativeEvent)}
    >
      <FlyoutCheckedContext value={checked}>{children}</FlyoutCheckedContext>
    </FlyoutRow>
  )
}

export function FlyoutIndicator({
  keepMounted: _keepMounted,
  render,
  className,
  style,
  ...props
}: PartProps<typeof MenuPrimitive.CheckboxItemIndicator>) {
  plainOnly("A menu item indicator", render)
  return (
    <span
      {...checkedAttributes(React.use(FlyoutCheckedContext))}
      {...props}
      className={classOf(className)}
      style={styleOf(style)}
    />
  )
}

export function FlyoutInput({
  className,
  onChange,
  render,
  style,
  value: _value,
  ...props
}: PartProps<typeof MenuPrimitive.Input>) {
  plainOnly("DropdownMenuInput", render)
  const filter = React.use(FlyoutFilterContext)
  return (
    <input
      {...props}
      role="searchbox"
      autoComplete="off"
      aria-controls={filter?.listId}
      value={filter?.query ?? ""}
      className={classOf(className)}
      style={styleOf(style)}
      onChange={(event) => {
        onChange?.(asBaseUIEvent(event))
        filter?.setQuery(event.target.value, "input-change", event.nativeEvent)
      }}
    />
  )
}

export function FlyoutList({
  className,
  render,
  style,
  ...props
}: PartProps<typeof MenuPrimitive.List>) {
  plainOnly("DropdownMenuList", render)
  return (
    <div
      {...props}
      role="menu"
      id={React.use(FlyoutFilterContext)?.listId}
      className={classOf(className)}
      style={styleOf(style)}
    />
  )
}

export function FlyoutEmpty({
  className,
  render,
  style,
  ...props
}: PartProps<typeof MenuPrimitive.Empty>) {
  plainOnly("DropdownMenuEmpty", render)
  const store = React.use(FlyoutFilterContext)?.store
  const empty = React.useSyncExternalStore(
    store?.subscribe ?? noSubscribe,
    () => store?.empty() ?? false
  )
  if (!empty) return null
  return (
    <div
      {...props}
      role="status"
      aria-live="polite"
      aria-atomic
      className={classOf(className)}
      style={styleOf(style)}
    />
  )
}

export function FlyoutGroup({
  className,
  render,
  style,
  ...props
}: PartProps<typeof MenuPrimitive.Group>) {
  plainOnly("DropdownMenuGroup", render)
  return (
    <div
      {...props}
      role="group"
      className={classOf(className)}
      style={styleOf(style)}
    />
  )
}

export function FlyoutSeparator({
  className,
  render,
  style,
  orientation: _orientation,
  ...props
}: PartProps<typeof MenuPrimitive.Separator>) {
  plainOnly("DropdownMenuSeparator", render)
  return (
    <div
      {...props}
      role="separator"
      aria-orientation="horizontal"
      className={classOf(className)}
      style={styleOf(style)}
    />
  )
}
