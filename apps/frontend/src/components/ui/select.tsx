"use client"

import { Select as SelectPrimitive } from "@base-ui/react/select"
import { cva, type VariantProps } from "class-variance-authority"
import { CheckIcon, ChevronDown } from "lucide-react"
import {
  Children,
  isValidElement,
  useMemo,
  type ComponentProps,
  type ReactElement,
  type ReactNode
} from "react"

import { MenuHighlight } from "@/components/ui/menu-highlight"
import {
  menuChoiceIndicatorClass,
  menuChoiceItemClass,
  menuItemClass,
  menuLabelClass,
  menuPopupClass,
  menuSeparatorClass
} from "@/components/ui/menu-styles"
import type { IconComponent } from "@/lib/icon-context"
import { useShape } from "@/lib/shape-context"
import { cn } from "@/lib/utils"

type SelectItemEntry = Readonly<{ value: string; label: ReactNode }>

const collectItems = (
  node: ReactNode,
  out: Array<SelectItemEntry> = []
): Array<SelectItemEntry> => {
  Children.forEach(node, (child) => {
    if (!isValidElement(child)) return
    const props = child.props as Readonly<{
      value?: unknown
      label?: ReactNode
      children?: ReactNode
    }>
    if (typeof props.value === "string") {
      out.push({ value: props.value, label: props.label ?? props.children })
    } else if (props.children) {
      collectItems(props.children, out)
    }
  })
  return out
}

type SelectBaseProps = Readonly<{
  children: ReactNode
  disabled?: boolean
  name?: string
  required?: boolean
  open?: boolean
  onOpenChange?: (open: boolean) => void
}>

type SingleSelectProps = SelectBaseProps &
  Readonly<{
    multiple?: false
    value?: string
    defaultValue?: string
    onValueChange?: (value: string) => void
  }>

type MultipleSelectProps = SelectBaseProps &
  Readonly<{
    multiple: true
    value?: ReadonlyArray<string>
    defaultValue?: ReadonlyArray<string>
    onValueChange?: (value: Array<string>) => void
  }>

export type SelectProps = SingleSelectProps | MultipleSelectProps

const toRootValue = (value: string | undefined) =>
  value === undefined ? undefined : value === "" ? null : value

function Select(props: SelectProps) {
  const { children, disabled, name, required, open, onOpenChange } = props
  const items = useMemo(() => collectItems(children), [children])
  const shared = {
    items,
    disabled,
    name,
    required,
    open,
    onOpenChange: onOpenChange
      ? (next: boolean) => onOpenChange(next)
      : undefined,
    modal: false
  }

  if (props.multiple) {
    return (
      <SelectPrimitive.Root
        {...shared}
        multiple
        value={props.value ? [...props.value] : undefined}
        defaultValue={props.defaultValue ? [...props.defaultValue] : undefined}
        onValueChange={(next) => props.onValueChange?.(next ?? [])}
      >
        {children}
      </SelectPrimitive.Root>
    )
  }

  return (
    <SelectPrimitive.Root
      {...shared}
      value={toRootValue(props.value)}
      defaultValue={toRootValue(props.defaultValue)}
      onValueChange={(next) => props.onValueChange?.(next ?? "")}
    >
      {children}
    </SelectPrimitive.Root>
  )
}

const triggerVariants = cva(
  [
    "group inline-flex cursor-pointer items-center justify-between gap-2 outline-none",
    "h-9 min-w-[160px] px-3 text-[13px] text-foreground",
    "transition-all duration-80",
    "disabled:pointer-events-none disabled:opacity-50 data-[disabled]:pointer-events-none data-[disabled]:opacity-50",
    "focus-visible:ring-1 focus-visible:ring-[#6B97FF]"
  ],
  {
    variants: {
      variant: {
        bordered: "border border-border bg-transparent hover:bg-hover",
        borderless: "border border-transparent bg-transparent hover:bg-hover"
      }
    },
    defaultVariants: {
      variant: "bordered"
    }
  }
)

type SelectTriggerProps = Omit<
  ComponentProps<typeof SelectPrimitive.Trigger>,
  "children" | "render"
> &
  VariantProps<typeof triggerVariants> &
  Readonly<{
    icon?: IconComponent
    placeholder?: string
    selectedLabel?: ReactNode
    error?: string
    render?: ReactElement
    children?: ReactNode
  }>

function SelectTrigger({
  className,
  variant,
  icon: Icon,
  placeholder = "Select…",
  selectedLabel,
  error,
  render,
  children,
  ...props
}: SelectTriggerProps) {
  const shape = useShape()

  if (render) {
    return (
      <SelectPrimitive.Trigger render={render} className={className} {...props}>
        {children}
      </SelectPrimitive.Trigger>
    )
  }

  return (
    <div className="flex min-w-0 flex-col gap-1">
      <SelectPrimitive.Trigger
        aria-invalid={error ? true : undefined}
        className={cn(
          triggerVariants({ variant }),
          shape.input,
          error && "border-destructive/50 hover:border-destructive/50",
          className
        )}
        {...props}
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
            <SelectPrimitive.Value
              placeholder={placeholder}
              className="flex min-w-0 flex-1 items-center truncate text-left data-[placeholder]:text-muted-foreground"
            >
              {selectedLabel === undefined ? undefined : () => selectedLabel}
            </SelectPrimitive.Value>
          )}
        </span>
        <ChevronDown
          className="size-4 shrink-0 text-muted-foreground transition-colors duration-80 group-hover:text-foreground"
          strokeWidth={2}
        />
      </SelectPrimitive.Trigger>
      {error ? (
        <span className="pl-3 text-[12px] text-destructive">{error}</span>
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
}>

function SelectContent({
  className,
  children,
  align = "start",
  side = "bottom",
  sideOffset = 6
}: SelectContentProps) {
  return (
    <SelectPrimitive.Portal>
      <SelectPrimitive.Positioner
        align={align}
        side={side}
        sideOffset={sideOffset}
        alignItemWithTrigger={false}
        className="z-50 outline-none"
      >
        <SelectPrimitive.Popup
          className={cn(
            menuPopupClass,
            "min-w-[var(--anchor-width)]",
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
  }>

function SelectItem({
  className,
  children,
  value,
  label,
  icon: Icon,
  separated = false,
  ...props
}: SelectItemProps) {
  const item = (
    <SelectPrimitive.Item
      value={value}
      label={label ?? (typeof children === "string" ? children : undefined)}
      className={cn(menuItemClass, menuChoiceItemClass, className)}
      {...props}
    >
      {Icon ? <Icon size={16} strokeWidth={1.5} /> : null}
      <SelectPrimitive.ItemText className="flex min-w-0 flex-1 items-center gap-2 truncate">
        {children}
      </SelectPrimitive.ItemText>
      <SelectPrimitive.ItemIndicator
        keepMounted
        className={menuChoiceIndicatorClass}
      >
        <CheckIcon className="size-3.5" strokeWidth={2} />
      </SelectPrimitive.ItemIndicator>
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

function SelectGroup(props: ComponentProps<typeof SelectPrimitive.Group>) {
  return <SelectPrimitive.Group {...props} />
}

function SelectLabel({
  className,
  ...props
}: ComponentProps<typeof SelectPrimitive.GroupLabel>) {
  return (
    <SelectPrimitive.GroupLabel
      className={cn(menuLabelClass, className)}
      {...props}
    />
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

export {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectSeparator,
  SelectTrigger,
  SelectValue,
  triggerVariants
}

export type { SelectContentProps, SelectItemProps, SelectTriggerProps }
