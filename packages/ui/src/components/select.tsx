import { mergeProps } from "@base-ui/react/merge-props"
import { Select as SelectPrimitive } from "@base-ui/react/select"
import {
  createContext,
  use,
  useState,
  type ComponentProps,
  type ReactElement,
  type ReactNode
} from "react"

import type { IconComponent } from "../lib/icon"
import { openOnReleaseProps } from "../lib/openOnRelease"
import {
  PopupAnchorProvider,
  usePopupAnchor,
  useTriggerAnchorRef
} from "../lib/popupAnchor"
import { cn } from "../lib/utils"
import { Button } from "./button"
import { ChevronDown } from "./icons"
import { MenuHighlight } from "./menu-highlight"
import {
  menuItemClass,
  menuPopupClass,
  menuSeparatorClass
} from "./menu-styles"
import { TextSwap } from "./text-swap"

export type SelectOption<Value extends string> = Readonly<{
  value: Value
  label: ReactNode
  textValue?: string
  icon?: IconComponent
  separated?: boolean
  disabled?: boolean
  onAction?: () => void
}>

type SelectBaseProps<Value extends string> = Readonly<{
  items: ReadonlyArray<SelectOption<Value> | SelectOption<string>>
  children: ReactNode
  contentProps?: Omit<SelectContentProps, "children">
  disabled?: boolean
  name?: string
  required?: boolean
  open?: boolean
  onOpenChange?: (
    open: boolean,
    details: SelectPrimitive.Root.OpenChangeEventDetails
  ) => void
  size?: "default" | "compact"
}>

type SingleSelectProps<Value extends string> = SelectBaseProps<Value> &
  Readonly<{
    multiple?: false
    value?: NoInfer<Value> | null
    defaultValue?: NoInfer<Value> | null
    onValueChange?: (value: NoInfer<Value>) => void
  }>

type MultipleSelectProps<Value extends string> = SelectBaseProps<Value> &
  Readonly<{
    multiple: true
    value?: ReadonlyArray<NoInfer<Value>>
    defaultValue?: ReadonlyArray<NoInfer<Value>>
    onValueChange?: (value: ReadonlyArray<NoInfer<Value>>) => void
  }>

export type SelectProps<Value extends string = string> =
  | SingleSelectProps<Value>
  | MultipleSelectProps<Value>

type ChoiceValue<Items extends ReadonlyArray<SelectOption<string>>> = Exclude<
  Items[number],
  Readonly<{ onAction: () => void }>
>["value"]

// The chosen value, or several with `multiple`, or null while none is.
type Chosen = string | ReadonlyArray<string> | null

// The options, for the trigger: it shows the chosen option's label itself so
// it can roll it through TextSwap.
type SelectShared = Readonly<{
  items: ReadonlyArray<SelectOption<string>>
  value: Chosen
}>

const SelectItemsContext = createContext<SelectShared>({
  items: [],
  value: null
})

function Select<const Items extends ReadonlyArray<SelectOption<string>>>(
  props: SelectProps<ChoiceValue<Items>> & Readonly<{ items: Items }>
) {
  const {
    items,
    children,
    contentProps,
    disabled,
    name,
    required,
    open,
    onOpenChange,
    size = "default"
  } = props
  // Mirror the value (controlled or not) so the trigger can swap its label
  // itself instead of going through Select.Value.
  const [uncontrolled, setUncontrolled] = useState<Chosen>(
    props.defaultValue ?? null
  )
  const chosen: Chosen =
    props.value === undefined ? uncontrolled : (props.value ?? null)
  const shared = {
    items,
    disabled,
    name,
    required,
    open,
    onOpenChange: onOpenChange
      ? (next: boolean, details: SelectPrimitive.Root.OpenChangeEventDetails) =>
          onOpenChange(next, details)
      : undefined,
    modal: false
  }
  const actionFor = (value: string) =>
    items.find((item) => item.value === value)?.onAction
  const content = (
    <SelectContent
      {...(size === "compact" ? compactContentProps : undefined)}
      {...contentProps}
    >
      {items.map((item) => (
        <SelectItem
          key={item.value}
          value={item.value}
          label={item.textValue}
          icon={item.icon}
          separated={item.separated}
          disabled={item.disabled}
          indicator={item.onAction === undefined}
        >
          {item.label}
        </SelectItem>
      ))}
    </SelectContent>
  )

  if (props.multiple) {
    return (
      <SelectPrimitive.Root<Items[number]["value"], true>
        {...shared}
        multiple
        value={props.value}
        defaultValue={props.defaultValue}
        onValueChange={(next, details) => {
          const action = next.map(actionFor).find(Boolean)
          if (action) {
            details.cancel()
            action()
            return
          }
          setUncontrolled(next)
          props.onValueChange?.(next)
        }}
      >
        <PopupAnchorProvider>
          <SelectItemsContext value={{ items, value: chosen }}>
            {children}
          </SelectItemsContext>
          {content}
        </PopupAnchorProvider>
      </SelectPrimitive.Root>
    )
  }

  return (
    <SelectPrimitive.Root<Items[number]["value"]>
      {...shared}
      value={props.value}
      defaultValue={props.defaultValue}
      onValueChange={(next, details) => {
        if (next === null) return
        const action = actionFor(next)
        if (action) {
          details.cancel()
          action()
          return
        }
        setUncontrolled(next)
        props.onValueChange?.(next)
      }}
    >
      <PopupAnchorProvider>
        <SelectItemsContext value={{ items, value: chosen }}>
          {children}
        </SelectItemsContext>
        {content}
      </PopupAnchorProvider>
    </SelectPrimitive.Root>
  )
}

const compactContentProps = {
  sideOffset: 4
} as const

type SelectTriggerProps = Omit<
  ComponentProps<typeof SelectPrimitive.Trigger>,
  "children" | "render"
> &
  Readonly<{
    // bordered: the field look, like Input. borderless: a ghost button.
    variant?: "bordered" | "borderless"
    size?: "default" | "compact"
    icon?: IconComponent
    placeholder?: string
    selectedLabel?: ReactNode
    error?: string
    render?: ReactElement
    children?: ReactNode
  }>

// A text label rolls through TextSwap; a label with elements (an option that
// brings its own icon) shows as is.
function ChosenLabel({
  label,
  className
}: Readonly<{ label: ReactNode; className?: string }>) {
  if (typeof label === "string")
    return <TextSwap className={className}>{label}</TextSwap>
  return (
    <span className={cn("flex min-w-0 items-center truncate", className)}>
      {label}
    </span>
  )
}

const labelFor = (
  items: ReadonlyArray<SelectOption<string>>,
  value: string | ReadonlyArray<string>
) => {
  if (typeof value === "string")
    return items.find((option) => option.value === value)?.label ?? value
  return value
    .map(
      (one) => items.find((option) => option.value === one)?.textValue ?? one
    )
    .join(", ")
}

// The trigger is a Button underneath (variant "field"), so it shares the
// button's height, corners, focus ring, press and disabled cursor.
function SelectTrigger({
  className,
  variant = "bordered",
  size = "default",
  icon: Icon,
  placeholder,
  selectedLabel,
  error,
  render,
  children,
  ref,
  ...props
}: SelectTriggerProps) {
  const { items, value: chosen } = use(SelectItemsContext)
  const anchorRef = useTriggerAnchorRef(ref)
  if (render) {
    return (
      <SelectPrimitive.Trigger
        ref={anchorRef}
        render={render}
        className={className}
        {...mergeProps(openOnReleaseProps, props)}
      >
        {children}
      </SelectPrimitive.Trigger>
    )
  }

  return (
    <div className="flex max-w-full min-w-0 flex-col gap-1">
      <SelectPrimitive.Trigger
        ref={anchorRef}
        aria-invalid={error ? true : undefined}
        render={
          <Button
            type="button"
            variant={variant === "borderless" ? "ghost" : "field"}
            tone="strong"
            size={size === "compact" ? "sm" : "lg"}
          />
        }
        className={cn(
          "gap-2",
          size === "compact" ? "min-w-0" : "min-w-[160px]",
          className
        )}
        {...mergeProps(openOnReleaseProps, props)}
      >
        <span className="flex min-w-0 flex-1 items-center gap-2">
          {Icon ? (
            <Icon
              size={16}
              strokeWidth={1.5}
              className="shrink-0 text-muted-foreground transition-[color,stroke-width] duration-80 group-hover:stroke-[2] group-hover:text-foreground"
            />
          ) : null}
          {children ?? (
            <ChosenLabel
              label={
                chosen === null
                  ? placeholder
                  : (selectedLabel ?? labelFor(items, chosen))
              }
              className={cn(
                "flex-1 gap-2 text-left",
                chosen === null && "text-muted-foreground"
              )}
            />
          )}
        </span>
        <ChevronDown
          aria-hidden
          className="size-4 shrink-0 text-muted-foreground transition-[rotate,color] duration-280 ease-spring group-hover:text-foreground group-data-[popup-open]:rotate-180 group-data-[popup-open]:text-foreground motion-reduce:transition-none"
          strokeWidth={2}
        />
      </SelectPrimitive.Trigger>
      {error ? (
        <span className="pl-3 text-caption text-destructive">{error}</span>
      ) : null}
    </div>
  )
}

const SelectValue = SelectPrimitive.Value

type SelectContentProps = Readonly<{
  className?: string
  children: ReactNode
  align?: "start" | "center" | "end"
  side?: "top" | "bottom" | "left" | "right"
  sideOffset?: number
  finalFocus?: ComponentProps<typeof SelectPrimitive.Popup>["finalFocus"]
}>

function SelectContent({
  className,
  children,
  align = "start",
  side = "bottom",
  sideOffset = 6,
  finalFocus
}: SelectContentProps) {
  const anchor = usePopupAnchor(undefined)
  return (
    <SelectPrimitive.Portal>
      <SelectPrimitive.Positioner
        align={align}
        side={side}
        sideOffset={sideOffset}
        alignItemWithTrigger={false}
        anchor={anchor}
        className="z-50 outline-none"
      >
        <SelectPrimitive.Popup
          finalFocus={finalFocus}
          onClick={(event) => event.stopPropagation()}
          className={cn(
            menuPopupClass,
            // At least 192px so a compact trigger still gets a list wide
            // enough to read, and at least as wide as a wider trigger.
            "min-w-[max(12rem,var(--anchor-width))]",
            className
          )}
        >
          <MenuHighlight />
          {children}
        </SelectPrimitive.Popup>
      </SelectPrimitive.Positioner>
    </SelectPrimitive.Portal>
  )
}

type SelectItemProps = Omit<
  ComponentProps<typeof SelectPrimitive.Item>,
  "value" | "label"
> &
  Readonly<{
    value: string
    label?: string
    icon?: IconComponent
    separated?: boolean
    indicator?: boolean
  }>

// The chosen row marks itself like a DropdownMenu radio row: a leading slot
// springs open, a dot pops in and the label turns semibold. No row fill and
// no trailing tick, so it never stacks with the sliding highlight.
const choiceItemClass =
  "transition-[color,font-weight] duration-150 data-[selected]:font-semibold data-[selected]:text-foreground data-[highlighted]:duration-0 motion-reduce:transition-none"

const choiceIndicatorClass =
  "-mr-2 w-0 shrink-0 opacity-0 transition-[width,margin,opacity] duration-[160ms,160ms,80ms] delay-[40ms,40ms,0ms] ease-standard group-data-[selected]/choice:mr-0 group-data-[selected]/choice:w-4 group-data-[selected]/choice:opacity-100 group-data-[selected]/choice:duration-[260ms,260ms,60ms] group-data-[selected]/choice:delay-0 group-data-[selected]/choice:ease-spring motion-reduce:transition-none"

const choiceDotClass =
  "origin-center fill-current [scale:0] transition-[scale] duration-80 ease-standard group-data-[selected]/choice:[scale:1] group-data-[selected]/choice:duration-260 group-data-[selected]/choice:delay-60 group-data-[selected]/choice:ease-spring motion-reduce:transition-none"

function SelectItem({
  className,
  children,
  value,
  label,
  icon: Icon,
  separated = false,
  indicator = true,
  ...props
}: SelectItemProps) {
  const item = (
    <SelectPrimitive.Item
      value={value}
      label={label ?? (typeof children === "string" ? children : undefined)}
      className={cn(menuItemClass, "group/choice", choiceItemClass, className)}
      {...props}
    >
      {indicator ? (
        <SelectPrimitive.ItemIndicator
          keepMounted
          aria-hidden
          className={choiceIndicatorClass}
        >
          <svg viewBox="0 0 16 16" className="size-4 overflow-visible">
            <circle cx="8" cy="8" r="3" className={choiceDotClass} />
          </svg>
        </SelectPrimitive.ItemIndicator>
      ) : null}
      {Icon ? <Icon size={16} strokeWidth={1.5} /> : null}
      <SelectPrimitive.ItemText className="flex min-w-0 flex-1 items-center gap-2 truncate">
        {children}
      </SelectPrimitive.ItemText>
    </SelectPrimitive.Item>
  )
  if (!separated) return item
  return (
    <>
      {item}
      <SelectSeparator />
    </>
  )
}

function SelectSeparator({
  className,
  ...props
}: ComponentProps<typeof SelectPrimitive.Separator>) {
  return (
    <SelectPrimitive.Separator
      className={cn(menuSeparatorClass, className)}
      {...props}
    />
  )
}

export { Select, SelectTrigger, SelectValue }

export type { SelectContentProps, SelectTriggerProps }
