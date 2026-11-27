import type { BaseUIChangeEventDetails } from "@base-ui/react"
import { Menu as MenuPrimitive } from "@base-ui/react/menu"
import * as React from "react"
import { flushSync } from "react-dom"

import { useMenuControl } from "../lib/menuClose"
import {
  createFlyoutLevel,
  matchesQuery,
  type FlyoutLevel
} from "../lib/menuFlyout"
import { cn } from "../lib/utils"
import { menuScrollClass } from "./menu-styles"

const ROW = "[role^=menuitem]:not([data-disabled])"
const SUB_TRIGGER = "[data-slot=dropdown-menu-sub-trigger]"
const OPEN_KEYS = new Set(["ArrowRight", "Enter", " "])

export type DropdownMenuFilter =
  | boolean
  | Omit<MenuPrimitive.FilterProvider.Props, "children">

type FlyoutRoot = Readonly<{
  level: FlyoutLevel
  layer: HTMLElement | null
  placers: Set<() => void>
}>

export type PanelController = Readonly<{
  setOpen: (open: boolean) => void
  highlight: (row: HTMLElement | null, reveal?: boolean) => void
  highlightFirst: () => void
  focusIn: () => void
  onKeyDown: (event: React.KeyboardEvent<HTMLElement>) => void
  onPointerMove: (event: React.PointerEvent<HTMLElement>) => void
  onPointerLeave: () => void
}>

type FlyoutSub = Readonly<{
  id: string
  triggerId: string
  panelId: string
  filtered: boolean
  trigger: React.RefObject<HTMLElement | null>
  panel: React.RefObject<PanelController | null>
}>

type MatchStore = Readonly<{
  set: (id: string, matched: boolean | null) => void
  subscribe: (listener: () => void) => () => void
  empty: () => boolean
}>

export type FlyoutFilter = Readonly<{
  query: string
  listId: string
  matches: (text: string) => boolean
  setQuery: (
    next: string,
    reason: "input-change" | "popup-close",
    event: Event
  ) => void
  store: MatchStore
}>

export const FlyoutRootContext = React.createContext<FlyoutRoot | null>(null)
export const FlyoutSubContext = React.createContext<FlyoutSub | null>(null)
export const FlyoutPanelContext = React.createContext<PanelController | null>(
  null
)
export const FlyoutFilterContext = React.createContext<FlyoutFilter | null>(
  null
)

export function changeDetails<Reason extends string>(
  reason: Reason,
  event: Event
) {
  let canceled = false
  let propagates = false
  return {
    reason,
    event,
    trigger: undefined,
    cancel: () => {
      canceled = true
    },
    allowPropagation: () => {
      propagates = true
    },
    get isCanceled() {
      return canceled
    },
    get isPropagationAllowed() {
      return propagates
    },
    preventUnmountOnClose: () => {}
  } as unknown as BaseUIChangeEventDetails<Reason> & {
    preventUnmountOnClose: () => void
  }
}

export function usePreparedAfterPaint() {
  const [prepared, setPrepared] = React.useState(false)
  React.useEffect(() => {
    const timer = window.setTimeout(
      () => React.startTransition(() => setPrepared(true)),
      0
    )
    return () => window.clearTimeout(timer)
  }, [])
  return prepared
}

const noSubscribe = () => () => {}

export function useFlyoutOpen(id: string, watching = true) {
  const root = React.use(FlyoutRootContext)
  return React.useSyncExternalStore(
    (watching ? root?.level.subscribe : undefined) ?? noSubscribe,
    () => root?.level.active() === id
  )
}

function usePlacers(scroll: React.RefObject<HTMLElement | null>) {
  const [placers] = React.useState(() => new Set<() => void>())
  React.useEffect(() => {
    const box = scroll.current
    const popup = box?.parentElement
    if (!box || !popup) return undefined
    const placeAll = () => {
      for (const place of placers) place()
    }
    const resizes =
      typeof ResizeObserver === "undefined"
        ? null
        : new ResizeObserver(placeAll)
    resizes?.observe(popup)
    box.addEventListener("scroll", placeAll, { passive: true })
    return () => {
      resizes?.disconnect()
      box.removeEventListener("scroll", placeAll)
    }
  }, [scroll, placers])
  return placers
}

// The root's rows scroll in their own box, so panels beside it are not clipped.
export function FlyoutRoot({
  children
}: Readonly<{ children: React.ReactNode }>) {
  const control = useMenuControl()
  const [layer, setLayer] = React.useState<HTMLElement | null>(null)
  const layerRef = React.useRef<HTMLElement | null>(null)
  const scrollRef = React.useRef<HTMLDivElement>(null)
  const [level] = React.useState(() =>
    createFlyoutLevel(
      () => control.held(),
      (exit) =>
        layerRef.current?.toggleAttribute("data-instant", exit === "instant")
    )
  )
  const placers = usePlacers(scrollRef)
  const attach = React.useCallback((element: HTMLDivElement | null) => {
    layerRef.current = element
    setLayer(element)
  }, [])
  const root = React.useMemo(
    () => ({ level, layer, placers }),
    [level, layer, placers]
  )
  return (
    <FlyoutRootContext value={root}>
      <div
        ref={scrollRef}
        role="menu"
        aria-orientation="vertical"
        data-slot="dropdown-menu-scroll"
        className={cn(
          "relative rounded-[inherit] [corner-shape:var(--button-corner)]",
          menuScrollClass
        )}
        onPointerMove={(event) => {
          const target = event.target
          if (!(target instanceof Element)) return
          if (!event.currentTarget.contains(target)) return
          const row = target.closest(ROW)
          if (row === null || row.matches(SUB_TRIGGER)) return
          if (level.active() !== null) flushSync(() => level.close("fade"))
        }}
      >
        {children}
      </div>
      <div
        ref={attach}
        data-slot="dropdown-menu-flyout-layer"
        className="absolute top-0 left-0 z-30 size-0 [&[data-instant]>*]:transition-none"
      />
    </FlyoutRootContext>
  )
}

function createMatchStore() {
  const matched = new Map<string, boolean>()
  const listeners = new Set<() => void>()
  return {
    set: (id, value) => {
      if (value === null) matched.delete(id)
      else matched.set(id, value)
      for (const listener of listeners) listener()
    },
    subscribe: (listener) => {
      listeners.add(listener)
      return () => {
        listeners.delete(listener)
      }
    },
    empty: () => ![...matched.values()].some(Boolean)
  } satisfies MatchStore
}

function useFlyoutFilter(filterable: DropdownMenuFilter) {
  const options =
    filterable === true ? {} : filterable === false ? null : filterable
  const [own, setOwn] = React.useState(options?.defaultValue ?? "")
  const listId = React.useId()
  const [store] = React.useState(createMatchStore)
  if (options === null) return null
  const query = options.value ?? own
  const { filter, locale, onValueChange } = options
  return {
    query,
    listId,
    store,
    matches: (text) =>
      query.trim() === "" ||
      filter === null ||
      (filter === undefined
        ? matchesQuery(text, query, locale)
        : filter(text, query.trim())),
    setQuery: (next, reason, event) => {
      setOwn(next)
      onValueChange?.(next, changeDetails(reason, event))
    }
  } satisfies FlyoutFilter
}

const markTrigger = (trigger: HTMLElement | null, open: boolean) => {
  trigger?.toggleAttribute("data-submenu-open", open)
  trigger?.setAttribute("aria-expanded", String(open))
}

// A switch writes its rows' and panels' attributes directly: no render.
export function FlyoutSub({
  filterable,
  onOpenChange,
  children
}: Readonly<{
  filterable: DropdownMenuFilter
  onOpenChange: ((open: boolean) => void) | undefined
  children: React.ReactNode
}>) {
  const root = React.use(FlyoutRootContext)
  if (root === null) throw new Error("FlyoutSub needs a flyout menu")
  const id = React.useId()
  const trigger = React.useRef<HTMLElement | null>(null)
  const panel = React.useRef<PanelController | null>(null)
  const filter = useFlyoutFilter(filterable)
  const latest = React.useRef({ filter, onOpenChange })
  React.useLayoutEffect(() => {
    latest.current = { filter, onOpenChange }
  })
  React.useLayoutEffect(
    () =>
      root.level.watch(id, (open) => {
        markTrigger(trigger.current, open)
        panel.current?.setOpen(open)
        const current = latest.current
        if (!open && current.filter !== null && current.filter.query !== "")
          current.filter.setQuery("", "popup-close", new Event("close"))
        current.onOpenChange?.(open)
      }),
    [root.level, id]
  )
  const filtered = filter !== null
  const sub = React.useMemo(
    () => ({
      id,
      triggerId: `${id}-trigger`,
      panelId: `${id}-panel`,
      filtered,
      trigger,
      panel
    }),
    [id, filtered]
  )
  return (
    <FlyoutSubContext value={sub}>
      <FlyoutFilterContext value={filter}>{children}</FlyoutFilterContext>
    </FlyoutSubContext>
  )
}

export function FlyoutSubTrigger({
  openOnHover,
  onPointerMove,
  onClick,
  onKeyDown,
  render,
  style,
  ...props
}: Omit<
  React.ComponentProps<typeof MenuPrimitive.Item>,
  "render" | "style" | "className"
> &
  Readonly<{
    openOnHover: boolean
    render?: unknown
    style?: unknown
    className?: string
  }>) {
  if (render !== undefined || typeof style === "function")
    throw new Error(
      "A flyout submenu's trigger takes no render or style function"
    )
  const root = React.use(FlyoutRootContext)
  const sub = React.use(FlyoutSubContext)
  if (root === null || sub === null)
    throw new Error("FlyoutSubTrigger needs a FlyoutSub")
  const { level } = root
  const bind = React.useCallback(
    (element: HTMLElement | null) => {
      sub.trigger.current = element
      markTrigger(element, level.active() === sub.id)
    },
    [sub, level]
  )
  const show = (keyboard: boolean) => {
    flushSync(() => level.open(sub.id))
    if (keyboard && level.active() === sub.id) sub.panel.current?.focusIn()
  }
  return (
    <MenuPrimitive.Item
      {...props}
      ref={bind}
      style={style as React.CSSProperties | undefined}
      id={sub.triggerId}
      closeOnClick={false}
      aria-haspopup={sub.filtered ? "dialog" : "menu"}
      aria-controls={sub.panelId}
      onPointerMove={(event) => {
        onPointerMove?.(event)
        if (openOnHover && level.active() !== sub.id)
          flushSync(() => level.open(sub.id))
      }}
      onClick={(event) => {
        onClick?.(event)
        show(event.detail === 0)
      }}
      onKeyDown={(event) => {
        onKeyDown?.(event)
        if (!OPEN_KEYS.has(event.key)) return
        event.preventDefault()
        event.preventBaseUIHandler()
        show(true)
      }}
    />
  )
}
