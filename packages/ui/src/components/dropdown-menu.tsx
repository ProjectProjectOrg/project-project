import { Menu as MenuPrimitive } from "@base-ui/react/menu"
import { mergeProps } from "@base-ui/react/merge-props"
import type * as Cause from "effect/Cause"
import * as Exit from "effect/Exit"
import * as React from "react"
import { flushSync } from "react-dom"

import { useActivityHiddenPortalRef } from "../hooks/useActivityHiddenPortalRef"
import { useCountdown } from "../lib/countdown"
import { forwardThroughMenuBackdrop, isMenuBackdrop } from "../lib/menuBackdrop"
import {
  MenuControlProvider,
  useHeldOpenChange,
  useMenuControl,
  useMenuRoot
} from "../lib/menuClose"
import { openOnReleaseProps } from "../lib/openOnRelease"
import {
  PopupAnchorProvider,
  usePopupAnchor,
  useTriggerAnchorRef
} from "../lib/popupAnchor"
import { fieldTouchClass } from "../lib/typeScale"
import { cn } from "../lib/utils"
import { ChevronRightIcon, CircleAlert } from "./icons"
import { KbdShortcut, type KbdShortcutProps } from "./kbd"
import { LogoLoader } from "./logo"
import { MenuHighlight } from "./menu-highlight"
import {
  menuItemClass,
  menuLabelClass,
  menuPopupClass,
  menuSeparatorClass,
  menuSurfaceClass
} from "./menu-styles"
import { TextSwap } from "./text-swap"

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
    <MenuPrimitive.FilterProvider autoHighlight="always" {...options}>
      {children}
    </MenuPrimitive.FilterProvider>
  )
}

function DeferredDropdownMenus({ children }: { children: React.ReactNode }) {
  return <DeferMenusContext value>{children}</DeferMenusContext>
}

function DropdownMenu({
  filterable = false,
  actionsRef: givenActions,
  onOpenChange,
  ...rest
}: DropdownMenuProps) {
  const defer = React.useContext(DeferMenusContext)
  const root = useMenuRoot(givenActions, onOpenChange)
  const props = {
    ...rest,
    actionsRef: root.ref,
    onOpenChange: root.onOpenChange
  }
  return (
    <MenuControlProvider value={root.control}>
      <PopupAnchorProvider>
        {defer && !props.handle && typeof props.children !== "function" ? (
          <DeferredDropdownMenu {...props} filterable={filterable}>
            {props.children}
          </DeferredDropdownMenu>
        ) : (
          <FilterableRoot filterable={filterable}>
            <MenuPrimitive.Root {...props} />
          </FilterableRoot>
        )}
      </PopupAnchorProvider>
    </MenuControlProvider>
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
  React.useEffect(() => {
    if (!mounted) return undefined
    const onContextMenu = (event: MouseEvent) => {
      if (!handle.isOpen) return
      if (
        event.target instanceof Element &&
        event.target.closest('[data-slot="dropdown-menu-content"]')
      ) {
        return
      }
      const backdrop = isMenuBackdrop(event.target)
      flushSync(() => handle.close())
      if (backdrop) {
        event.preventDefault()
        event.stopPropagation()
        forwardThroughMenuBackdrop(event)
      }
    }
    document.addEventListener("contextmenu", onContextMenu, true)
    return () =>
      document.removeEventListener("contextmenu", onContextMenu, true)
  }, [handle, mounted])
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

function DropdownMenuTrigger({
  ref,
  ...props
}: React.ComponentProps<typeof MenuPrimitive.Trigger>) {
  const deferred = React.useContext(DeferredMenuContext)
  const anchorRef = useTriggerAnchorRef(ref)
  return (
    <MenuPrimitive.Trigger
      ref={anchorRef}
      {...mergeProps(
        openOnReleaseProps,
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
    | "align"
    | "alignOffset"
    | "side"
    | "sideOffset"
    | "anchor"
    | "collisionAvoidance"
  > & { highlightFirst?: boolean }

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
  highlightFirst = false,
  className,
  align,
  alignOffset,
  side,
  sideOffset = 4,
  anchor,
  collisionAvoidance,
  onClick,
  onKeyDown,
  children,
  ...props
}: DropdownMenuContentProps) {
  const popupAnchor = usePopupAnchor(anchor)
  return (
    <DropdownMenuPortal>
      <MenuPrimitive.Positioner
        align={align}
        alignOffset={alignOffset}
        side={side}
        sideOffset={sideOffset}
        anchor={popupAnchor}
        collisionAvoidance={collisionAvoidance}
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
          <MenuHighlight restOnFirst={highlightFirst} />
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

type Outcome<E> = void | boolean | Exit.Exit<unknown, E>

// How long an armed confirm item waits for its second click, and how long
// it shows an error before going back to its label.
const ARMED_SECONDS = 4

type DropdownMenuConfirmItemProps<E> = Readonly<{
  label: string
  // What the armed item says: a question naming what goes.
  confirmLabel: string
  // What it says while onConfirm runs: the verb in progress ("Deleting…").
  busyLabel: string
  icon?: React.ReactNode
  onConfirm: () => Promise<Outcome<E>> | Outcome<E>
  describeError: (cause: Cause.Cause<E>) => string
  tone?: "destructive" | "neutral"
  // Looks like a plain item until armed, e.g. a list of targets (move to
  // this status, then delete) where only the armed one should be red.
  quiet?: boolean
  timeout?: number | false
  // Close the whole menu once onConfirm succeeds (default); otherwise the
  // item goes back to its label.
  closeOnConfirm?: boolean
  disabled?: boolean
  className?: string
}>

// A menu item that confirms in place. Any menu action that can't be undone
// or affects other people (delete, remove, disconnect, transfer, cancel an
// invite) uses it; the states, wording and checklist are on the gallery's
// Dropdown menu page, under "Confirm items". The first click arms it: the label
// rolls to `confirmLabel` through TextSwap and its fill turns into the
// countdown, drawn whether or not the pointer is on it. A second click runs
// onConfirm, with `busyLabel` and Button's logo loader in the icon's place,
// then closes the menu. When the countdown runs out the item rolls back to
// its label. A failure rolls the error in with an alert icon and keeps it
// armed for a retry; after the same timeout, unseen (no fill), it rolls back
// to its label too. The menu stays open throughout (closeOnClick is off).
function DropdownMenuConfirmItem<E = unknown>({
  label,
  confirmLabel,
  busyLabel,
  icon,
  onConfirm,
  describeError,
  tone = "destructive",
  quiet = false,
  timeout = ARMED_SECONDS,
  closeOnConfirm = true,
  disabled = false,
  className
}: DropdownMenuConfirmItemProps<E>) {
  const [phase, setPhase] = React.useState<"idle" | "armed" | "busy">("idle")
  const [error, setError] = React.useState<string | null>(null)
  const menu = useMenuControl()
  // Release the hold if the item goes away mid-action, so it can't leave
  // its menu stuck open.
  const holding = React.useRef(false)
  React.useEffect(
    () => () => {
      if (holding.current) menu.hold(false)
    },
    [menu]
  )
  const disarm = () => {
    setPhase("idle")
    setError(null)
  }
  // Armed: the visible countdown. Failed: the same timer with no fill, so
  // the error also resets by itself, and hover or focus holds it as well.
  const counting = phase === "armed" && timeout !== false
  const { countdownClass, countdownStyle, handleAnimationEnd } =
    useCountdown<HTMLDivElement>(
      counting ? { seconds: timeout, onElapsed: disarm } : undefined
    )

  // While onConfirm runs, the menu can't close (Escape, an outside click,
  // hovering off a submenu); the item closes it itself once it succeeds.
  async function run() {
    setPhase("busy")
    setError(null)
    menu.hold(true)
    holding.current = true
    const outcome = await Promise.resolve()
      .then(onConfirm)
      .catch(() => false as const)
    holding.current = false
    menu.hold(false)
    if (outcome === false) return setPhase("armed")
    if (Exit.isExit(outcome) && Exit.isFailure(outcome)) {
      setPhase("armed")
      return setError(describeError(outcome.cause))
    }
    if (closeOnConfirm) menu.close()
    setPhase("idle")
  }

  const destructive = tone === "destructive"
  return (
    <DropdownMenuItem
      variant={
        destructive && (!quiet || phase !== "idle") ? "destructive" : "default"
      }
      closeOnClick={false}
      disabled={disabled}
      data-armed={phase === "idle" ? undefined : ""}
      aria-busy={phase === "busy" || undefined}
      onClick={() => {
        if (phase === "idle") setPhase("armed")
        else if (phase === "armed") void run()
      }}
      onAnimationEnd={handleAnimationEnd}
      style={countdownStyle}
      className={cn(
        countdownClass,
        error !== null
          ? "[--countdown-fill:transparent]"
          : destructive
            ? // A step past the hover fill, so the countdown still reads
              // with the highlight under it.
              "[--countdown-fill:color-mix(in_oklab,var(--destructive-light),var(--destructive)_16%)]"
            : "[--countdown-fill:var(--active)] data-[armed]:text-foreground",
        className
      )}
    >
      <TextSwap
        className="gap-2"
        // Busy: the logo loader. Failed: an alert, since the label is
        // already in the destructive colour.
        icon={
          phase === "busy" ? (
            <LogoLoader tone="current" className="size-4" />
          ) : error !== null ? (
            <CircleAlert className="size-4" strokeWidth={1.75} />
          ) : (
            icon
          )
        }
        iconKey={phase === "busy" ? "busy" : error !== null ? "error" : "icon"}
        announce
      >
        {error ??
          (phase === "idle"
            ? label
            : phase === "busy"
              ? busyLabel
              : confirmLabel)}
      </TextSwap>
      {error === null ? null : (
        <span role="alert" className="sr-only">
          {error}
        </span>
      )}
    </DropdownMenuItem>
  )
}

const checkboxItemClass =
  "group/check transition-[color,font-weight] duration-150 data-[checked]:font-semibold data-[checked]:text-foreground data-[highlighted]:duration-0 [&>:is(svg,[data-slot=avatar],[aria-hidden]:not([data-slot$=-indicator]))]:transition-[opacity,filter] [&>:is(svg,[data-slot=avatar],[aria-hidden]:not([data-slot$=-indicator]))]:duration-150 data-[unchecked]:[&>:is(svg,[data-slot=avatar],[aria-hidden]:not([data-slot$=-indicator]))]:opacity-40 data-[unchecked]:[&>:is(svg,[data-slot=avatar],[aria-hidden]:not([data-slot$=-indicator]))]:saturate-30 motion-reduce:transition-none"

const checkboxIndicatorClass =
  "-mr-2 w-0 shrink-0 opacity-0 transition-[width,margin,opacity] duration-[160ms,160ms,80ms] delay-[40ms,40ms,0ms] ease-standard data-[checked]:mr-0 data-[checked]:w-4 data-[checked]:opacity-100 data-[checked]:duration-[260ms,260ms,60ms] data-[checked]:delay-0 data-[checked]:ease-spring motion-reduce:transition-none"

const checkboxTickClass =
  "fill-none stroke-current stroke-2 [stroke-dasharray:1] [stroke-dashoffset:1] [stroke-linecap:round] [stroke-linejoin:round] transition-[stroke-dashoffset] duration-80 ease-standard group-data-[checked]/check:[stroke-dashoffset:0] group-data-[checked]/check:duration-160 group-data-[checked]/check:delay-90 motion-reduce:transition-none"

const settleAtOnceClass = "transition-none [&_*]:transition-none"

const radioDotClass =
  "origin-center fill-current [scale:0] transition-[scale] duration-80 ease-standard group-data-[checked]/check:[scale:1] group-data-[checked]/check:duration-260 group-data-[checked]/check:delay-60 group-data-[checked]/check:ease-spring motion-reduce:transition-none"

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
      className={cn(menuItemClass, checkboxItemClass, className)}
      checked={checked}
      {...props}
    >
      <MenuPrimitive.CheckboxItemIndicator
        keepMounted
        aria-hidden
        data-slot="dropdown-menu-checkbox-indicator"
        className={checkboxIndicatorClass}
      >
        <svg viewBox="0 0 16 16" className="size-4 overflow-visible">
          <path
            pathLength={1}
            d="M3.8 8.4 L6.6 11.1 L12.2 5"
            className={checkboxTickClass}
          />
        </svg>
      </MenuPrimitive.CheckboxItemIndicator>
      {children}
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
  closeOnClick,
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
      closeOnClick={closeOnClick}
      className={cn(
        menuItemClass,
        checkboxItemClass,
        // A pick that closes the menu shows its mark at once: animating the
        // indent while the menu fades out reads as a missed click.
        closeOnClick && settleAtOnceClass,
        className
      )}
      {...props}
    >
      <MenuPrimitive.RadioItemIndicator
        keepMounted
        aria-hidden
        data-slot="dropdown-menu-radio-indicator"
        className={checkboxIndicatorClass}
      >
        <svg viewBox="0 0 16 16" className="size-4 overflow-visible">
          <circle cx="8" cy="8" r="3" className={radioDotClass} />
        </svg>
      </MenuPrimitive.RadioItemIndicator>
      {children}
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
          "h-9 w-full shrink-0 rounded-md bg-transparent px-2 text-foreground outline-none placeholder:text-muted-foreground",
          "text-body",
          fieldTouchClass,
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
      className={cn("relative overflow-x-hidden", className)}
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
        "px-2 py-2 text-muted-foreground empty:hidden",
        "text-body",
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

// A row's shortcut, as Kbd keys at the end of the row: ⌘ ⇧ ↑ on a Mac,
// Ctrl Shift ↑ elsewhere, like ⌘K and tooltips. Hidden from screen readers
// (a hint, not part of the row's name); put aria-keyshortcuts on the item.
function DropdownMenuShortcut({
  className,
  ...props
}: Omit<KbdShortcutProps, "size">) {
  return (
    <KbdShortcut
      data-slot="dropdown-menu-shortcut"
      data-menu-meta
      aria-hidden
      size="sm"
      // 9px from the highlight's end, the same as from its top and bottom
      // ((34 - 16) / 2): the row's 8px padding plus 1px.
      className={cn("mr-px ml-auto", className)}
      {...props}
    />
  )
}

// Rows sit 5px inside the popup (4px padding, 1px border). The submenu is
// placed against the row, so the side offset adds that inset back for a
// 6px gap between the two surfaces, and the align offset lines its first
// row up with the trigger row.
const MENU_ROW_INSET = 5
const SUBMENU_GAP = 6
const SUBMENU_SIDE_OFFSET = MENU_ROW_INSET + SUBMENU_GAP
const SUBMENU_ALIGN_OFFSET = -MENU_ROW_INSET

function DropdownMenuSub({
  filterable = false,
  onOpenChange,
  ...props
}: React.ComponentProps<typeof MenuPrimitive.SubmenuRoot> & {
  filterable?: DropdownMenuFilter
}) {
  // Stays open while an item in the menu is running its action.
  const guarded = useHeldOpenChange(onOpenChange)
  return (
    <FilterableRoot filterable={filterable}>
      <MenuPrimitive.SubmenuRoot {...props} onOpenChange={guarded} />
    </FilterableRoot>
  )
}

function DropdownMenuSubTrigger({
  className,
  inset,
  delay = 0,
  children,
  ...props
}: React.ComponentProps<typeof MenuPrimitive.SubmenuTrigger> & {
  inset?: boolean
}) {
  return (
    <MenuPrimitive.SubmenuTrigger
      delay={delay}
      data-slot="dropdown-menu-sub-trigger"
      data-inset={inset}
      className={cn(
        menuItemClass,
        "data-[popup-open]:text-foreground data-[popup-open]:[&_svg]:stroke-[2]",
        "data-[inset]:pl-8",
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
  alignOffset = SUBMENU_ALIGN_OFFSET,
  side,
  sideOffset = SUBMENU_SIDE_OFFSET,
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
          className={cn(menuSurfaceClass, className)}
          {...props}
        >
          <MenuHighlight restOnFirst />
          {children}
        </MenuPrimitive.Popup>
      </MenuPrimitive.Positioner>
    </DropdownMenuPortal>
  )
}

export {
  DropdownMenuConfirmItem,
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

export type { DropdownMenuConfirmItemProps }
