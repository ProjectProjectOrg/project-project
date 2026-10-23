import { Menu as MenuPrimitive } from "@base-ui/react/menu"
import { mergeProps } from "@base-ui/react/merge-props"
import { CheckIcon, ChevronRightIcon } from "lucide-react"
import * as React from "react"
import { flushSync } from "react-dom"

import { MenuHighlight } from "@/components/ui/menu-highlight"
import {
  menuChoiceIndicatorClass,
  menuChoiceItemClass,
  menuItemClass,
  menuLabelClass,
  menuPopupClass,
  menuSeparatorClass
} from "@/components/ui/menu-styles"
import { useActivityHiddenPortalRef } from "@/hooks/useActivityHiddenPortalRef"
import { cn } from "@/lib/utils"

const DeferMenusContext = React.createContext(false)
type DropdownMenuFilter =
  | boolean
  | Omit<MenuPrimitive.FilterProvider.Props, "children">
type DropdownMenuProps = React.ComponentProps<typeof MenuPrimitive.Root> & {
  filterable?: DropdownMenuFilter
}

const DeferredMenuContext = React.createContext<{
  handle: ReturnType<typeof MenuPrimitive.createHandle>
  mounted: boolean
  activate: () => void
  rootProps: React.ComponentProps<typeof MenuPrimitive.Root>
  filterable: DropdownMenuFilter
} | null>(null)

function FilterableRoot({
  filterable,
  children
}: {
  filterable: DropdownMenuFilter
  children: React.ReactElement
}) {
  if (!filterable) return children
  const options = filterable === true ? {} : filterable
  return (
    <MenuPrimitive.FilterProvider autoHighlight {...options}>
      {children}
    </MenuPrimitive.FilterProvider>
  )
}

function DeferredDropdownMenus({ children }: { children: React.ReactNode }) {
  return <DeferMenusContext value>{children}</DeferMenusContext>
}

function DropdownMenu({ filterable = false, ...props }: DropdownMenuProps) {
  const defer = React.useContext(DeferMenusContext)
  return defer && !props.handle && typeof props.children !== "function" ? (
    <DeferredDropdownMenu {...props} filterable={filterable}>
      {props.children}
    </DeferredDropdownMenu>
  ) : (
    <FilterableRoot filterable={filterable}>
      <MenuPrimitive.Root {...props} />
    </FilterableRoot>
  )
}

function DeferredDropdownMenu({
  children,
  filterable,
  ...rootProps
}: Omit<React.ComponentProps<typeof MenuPrimitive.Root>, "children"> & {
  children: React.ReactNode
  filterable: DropdownMenuFilter
}) {
  const [handle] = React.useState(() => MenuPrimitive.createHandle())
  const [mounted, setMounted] = React.useState(
    Boolean(rootProps.open ?? rootProps.defaultOpen)
  )
  const activate = React.useCallback(() => {
    if (!mounted) flushSync(() => setMounted(true))
  }, [mounted])
  return (
    <DeferredMenuContext
      value={{
        handle,
        mounted: mounted || rootProps.open === true,
        activate,
        rootProps,
        filterable
      }}
    >
      {children}
    </DeferredMenuContext>
  )
}

function DropdownMenuPortal({
  ...props
}: React.ComponentProps<typeof MenuPrimitive.Portal>) {
  const portalRef = useActivityHiddenPortalRef()
  return <MenuPrimitive.Portal ref={portalRef} {...props} />
}

function DropdownMenuTrigger(
  props: React.ComponentProps<typeof MenuPrimitive.Trigger>
) {
  const deferred = React.useContext(DeferredMenuContext)
  return (
    <MenuPrimitive.Trigger
      {...mergeProps(
        props,
        deferred
          ? {
              handle: deferred.handle,
              onPointerEnter: deferred.activate,
              onFocus: deferred.activate,
              onPointerDownCapture: deferred.activate,
              onKeyDownCapture: deferred.activate,
              onClickCapture: deferred.activate
            }
          : {}
      )}
      data-slot="dropdown-menu-trigger"
    />
  )
}

type DropdownMenuContentProps = React.ComponentProps<
  typeof MenuPrimitive.Popup
> &
  Pick<
    React.ComponentProps<typeof MenuPrimitive.Positioner>,
    "align" | "alignOffset" | "side" | "sideOffset" | "anchor"
  >

function DropdownMenuContent(props: DropdownMenuContentProps) {
  const deferred = React.useContext(DeferredMenuContext)
  if (!deferred) return <DropdownMenuPopup {...props} />
  if (!deferred.mounted) return null
  return (
    <DeferredMenuContext value={null}>
      <FilterableRoot filterable={deferred.filterable}>
        <MenuPrimitive.Root {...deferred.rootProps} handle={deferred.handle}>
          <DropdownMenuPopup {...props} />
        </MenuPrimitive.Root>
      </FilterableRoot>
    </DeferredMenuContext>
  )
}

function DropdownMenuPopup({
  className,
  align,
  alignOffset,
  side,
  sideOffset = 4,
  anchor,
  onClick,
  onKeyDown,
  children,
  ...props
}: DropdownMenuContentProps) {
  return (
    <DropdownMenuPortal>
      <MenuPrimitive.Positioner
        align={align}
        alignOffset={alignOffset}
        side={side}
        sideOffset={sideOffset}
        anchor={anchor}
      >
        <MenuPrimitive.Popup
          data-slot="dropdown-menu-content"
          onClick={(event) => {
            onClick?.(event)
            event.stopPropagation()
          }}
          onKeyDown={(event) => {
            onKeyDown?.(event)
            event.stopPropagation()
          }}
          className={cn(menuPopupClass, className)}
          {...props}
        >
          <MenuHighlight />
          {children}
        </MenuPrimitive.Popup>
      </MenuPrimitive.Positioner>
    </DropdownMenuPortal>
  )
}

function DropdownMenuGroup({
  ...props
}: React.ComponentProps<typeof MenuPrimitive.Group>) {
  return <MenuPrimitive.Group data-slot="dropdown-menu-group" {...props} />
}

function DropdownMenuItem({
  className,
  inset,
  variant = "default",
  ...props
}: React.ComponentProps<typeof MenuPrimitive.Item> & {
  inset?: boolean
  variant?: "default" | "destructive"
}) {
  return (
    <MenuPrimitive.Item
      data-slot="dropdown-menu-item"
      data-inset={inset}
      data-variant={variant}
      className={cn(
        menuItemClass,
        "data-[inset]:pl-8",
        "data-[variant=destructive]:text-destructive data-[variant=destructive]:data-[highlighted]:text-destructive",
        "data-[variant=destructive]:*:[svg]:text-destructive!",
        className
      )}
      {...props}
    />
  )
}

function DropdownMenuCheckboxItem({
  className,
  children,
  checked,
  separated = false,
  ...props
}: React.ComponentProps<typeof MenuPrimitive.CheckboxItem> & {
  separated?: boolean
}) {
  const item = (
    <MenuPrimitive.CheckboxItem
      data-slot="dropdown-menu-checkbox-item"
      className={cn(menuItemClass, menuChoiceItemClass, className)}
      checked={checked}
      {...props}
    >
      {children}
      <MenuPrimitive.CheckboxItemIndicator
        keepMounted
        className={menuChoiceIndicatorClass}
      >
        <CheckIcon className="size-3.5" strokeWidth={2} />
      </MenuPrimitive.CheckboxItemIndicator>
    </MenuPrimitive.CheckboxItem>
  )
  return separated ? (
    <>
      {item}
      <DropdownMenuSeparator />
    </>
  ) : (
    item
  )
}

export type DropdownMenuRadioOption<Value extends string> = Readonly<{
  value: Value
  label: React.ReactNode
  textValue?: string
  disabled?: boolean
  separated?: boolean
  closeOnClick?: boolean
  "aria-label"?: string
}>

export type DropdownMenuRadioGroupProps<Value extends string> = Readonly<
  Omit<
    React.ComponentProps<typeof MenuPrimitive.RadioGroup>,
    "children" | "value" | "defaultValue" | "onValueChange"
  >
> &
  Readonly<{
    items: ReadonlyArray<DropdownMenuRadioOption<Value>>
    value?: NoInfer<Value> | null
    defaultValue?: NoInfer<Value> | null
    onValueChange?: (
      value: NoInfer<Value>,
      details: MenuPrimitive.RadioGroup.ChangeEventDetails
    ) => void
  }>

function DropdownMenuRadioGroup<
  const Items extends ReadonlyArray<DropdownMenuRadioOption<string>>
>({
  items,
  onValueChange,
  ...props
}: DropdownMenuRadioGroupProps<Items[number]["value"]> &
  Readonly<{ items: Items }>) {
  return (
    <MenuPrimitive.RadioGroup
      data-slot="dropdown-menu-radio-group"
      {...props}
      onValueChange={(next, details) => {
        const item = items.find((item) => item.value === next)
        if (item === undefined) {
          details.cancel()
          return
        }
        onValueChange?.(item.value, details)
      }}
    >
      {items.map(({ label, textValue, ...item }) => (
        <DropdownMenuRadioItem key={item.value} label={textValue} {...item}>
          {label}
        </DropdownMenuRadioItem>
      ))}
    </MenuPrimitive.RadioGroup>
  )
}

function DropdownMenuRadioItem({
  className,
  children,
  separated = false,
  ...props
}: Readonly<
  Omit<React.ComponentProps<typeof MenuPrimitive.RadioItem>, "value">
> &
  Readonly<{
    value: string
    separated?: boolean
  }>) {
  const item = (
    <MenuPrimitive.RadioItem
      data-slot="dropdown-menu-radio-item"
      className={cn(menuItemClass, menuChoiceItemClass, className)}
      {...props}
    >
      {children}
      <MenuPrimitive.RadioItemIndicator
        keepMounted
        className={menuChoiceIndicatorClass}
      >
        <CheckIcon className="size-3.5" strokeWidth={2} />
      </MenuPrimitive.RadioItemIndicator>
    </MenuPrimitive.RadioItem>
  )
  return separated ? (
    <>
      {item}
      <DropdownMenuSeparator />
    </>
  ) : (
    item
  )
}

function DropdownMenuInput({
  className,
  ...props
}: React.ComponentProps<typeof MenuPrimitive.Input>) {
  return (
    <>
      <MenuPrimitive.Input
        data-slot="dropdown-menu-input"
        className={cn(
          "h-9 w-full shrink-0 rounded-md bg-transparent px-2 text-[13px] leading-5 text-foreground outline-none placeholder:text-muted-foreground",
          className
        )}
        {...props}
      />
      <DropdownMenuSeparator />
    </>
  )
}

function DropdownMenuList({
  className,
  children,
  ...props
}: React.ComponentProps<typeof MenuPrimitive.List>) {
  return (
    <MenuPrimitive.List
      data-slot="dropdown-menu-list"
      className={cn("relative", className)}
      {...props}
    >
      <MenuHighlight />
      {children}
    </MenuPrimitive.List>
  )
}

function DropdownMenuEmpty({
  className,
  ...props
}: React.ComponentProps<typeof MenuPrimitive.Empty>) {
  return (
    <MenuPrimitive.Empty
      data-slot="dropdown-menu-empty"
      className={cn(
        "px-2 py-2 text-[13px] text-muted-foreground empty:hidden",
        className
      )}
      {...props}
    />
  )
}

function DropdownMenuLabel({
  className,
  inset,
  ...props
}: React.ComponentProps<typeof MenuPrimitive.GroupLabel> & {
  inset?: boolean
}) {
  return (
    <MenuPrimitive.GroupLabel
      data-slot="dropdown-menu-label"
      data-inset={inset}
      className={cn(menuLabelClass, "data-[inset]:pl-8", className)}
      {...props}
    />
  )
}

function DropdownMenuSeparator({
  className,
  ...props
}: React.ComponentProps<typeof MenuPrimitive.Separator>) {
  return (
    <MenuPrimitive.Separator
      data-slot="dropdown-menu-separator"
      className={cn(menuSeparatorClass, className)}
      {...props}
    />
  )
}

function DropdownMenuShortcut({
  className,
  ...props
}: React.ComponentProps<"span">) {
  return (
    <span
      data-slot="dropdown-menu-shortcut"
      className={cn(
        "ml-auto text-xs tracking-widest text-muted-foreground",
        className
      )}
      {...props}
    />
  )
}

function DropdownMenuSub({
  ...props
}: React.ComponentProps<typeof MenuPrimitive.SubmenuRoot>) {
  return <MenuPrimitive.SubmenuRoot {...props} />
}

function DropdownMenuSubTrigger({
  className,
  inset,
  children,
  ...props
}: React.ComponentProps<typeof MenuPrimitive.SubmenuTrigger> & {
  inset?: boolean
}) {
  return (
    <MenuPrimitive.SubmenuTrigger
      data-slot="dropdown-menu-sub-trigger"
      data-inset={inset}
      className={cn(
        "relative flex cursor-pointer items-center gap-2 rounded-md border-y border-transparent bg-clip-padding px-2 py-[7px] text-[13px] leading-5 text-muted-foreground outline-hidden transition-colors",
        "data-[highlighted]:text-foreground",
        "data-[popup-open]:bg-active data-[popup-open]:text-foreground",
        "data-[inset]:pl-8",
        "[&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
        className
      )}
      {...props}
    >
      {children}
      <ChevronRightIcon className="ml-auto size-4" />
    </MenuPrimitive.SubmenuTrigger>
  )
}

type DropdownMenuSubContentProps = React.ComponentProps<
  typeof MenuPrimitive.Popup
> &
  Pick<
    React.ComponentProps<typeof MenuPrimitive.Positioner>,
    "align" | "alignOffset" | "side" | "sideOffset"
  >

function DropdownMenuSubContent({
  className,
  align,
  alignOffset,
  side,
  sideOffset,
  children,
  ...props
}: DropdownMenuSubContentProps) {
  return (
    <DropdownMenuPortal>
      <MenuPrimitive.Positioner
        align={align}
        alignOffset={alignOffset}
        side={side}
        sideOffset={sideOffset}
      >
        <MenuPrimitive.Popup
          data-slot="dropdown-menu-sub-content"
          className={cn(
            "relative z-50 min-w-[8rem] origin-[var(--transform-origin)] overflow-hidden rounded-xl border border-border/60 bg-card p-1 text-foreground shadow-[0_4px_12px_rgba(0,0,0,0.02)] data-[closed]:animate-out data-[closed]:fade-out-0 data-[closed]:zoom-out-95 data-[open]:animate-in data-[open]:fade-in-0 data-[open]:zoom-in-95 data-[side=bottom]:slide-in-from-top-2 data-[side=left]:slide-in-from-right-2 data-[side=right]:slide-in-from-left-2 data-[side=top]:slide-in-from-bottom-2 motion-reduce:data-[closed]:animate-none motion-reduce:data-[open]:animate-none dark:shadow-[0_8px_32px_rgba(0,0,0,0.5)]",
            className
          )}
          {...props}
        >
          <MenuHighlight />
          {children}
        </MenuPrimitive.Popup>
      </MenuPrimitive.Positioner>
    </DropdownMenuPortal>
  )
}

export {
  DropdownMenuEmpty,
  DropdownMenuInput,
  DropdownMenuList,
  DeferredDropdownMenus,
  DropdownMenu,
  DropdownMenuPortal,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuLabel,
  DropdownMenuItem,
  DropdownMenuCheckboxItem,
  DropdownMenuRadioGroup,
  DropdownMenuSeparator,
  DropdownMenuShortcut,
  DropdownMenuSub,
  DropdownMenuSubTrigger,
  DropdownMenuSubContent
}
