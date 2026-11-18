import { Dialog as DialogPrimitive } from "@base-ui/react/dialog"
import {
  animate,
  motion,
  useReducedMotion,
  type AnimationPlaybackControls
} from "motion/react"
import {
  createContext,
  memo,
  useCallback,
  useContext,
  useEffect,
  useId,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
  type Dispatch,
  type HTMLAttributes,
  type InputHTMLAttributes,
  type ReactNode,
  type Ref,
  type RefObject,
  type SetStateAction
} from "react"

import {
  FluidHoverHighlight,
  type FluidHoverSource
} from "@/components/ui/fluid-hover-highlight"
import { ScrollArea } from "@/components/ui/scroll-area"
import { SegmentedTabs } from "@/components/ui/segmented-tabs"
import {
  useFluidHover,
  useRegisterFluidHoverItem,
  type UseFluidHoverReturn
} from "@/hooks/useFluidHover"
import type { IconComponent } from "@/lib/icon"
import { spring } from "@/lib/springs"
import { cn } from "@/lib/utils"
import { m } from "@/paraglide/messages"

export type CommandMenuItemData = Readonly<{
  value: string
  label: string
  icon?: IconComponent
  group?: string
}>

type CommandMenuSection = Readonly<{
  id: string
  heading: string | null
  items: ReadonlyArray<CommandMenuItemData>
  start: number
}>

const MODIFIER_TOKENS: Readonly<Record<string, string>> = {
  mod: "mod",
  cmd: "meta",
  command: "meta",
  meta: "meta",
  win: "meta",
  super: "meta",
  ctrl: "ctrl",
  control: "ctrl",
  alt: "alt",
  option: "alt",
  opt: "alt",
  shift: "shift"
}

const KEY_ALIASES: Readonly<Record<string, string>> = {
  esc: "escape",
  return: "enter",
  space: " ",
  spacebar: " ",
  up: "arrowup",
  down: "arrowdown",
  left: "arrowleft",
  right: "arrowright",
  del: "delete",
  plus: "+"
}

const shortcutTokens = (shortcut: string): ReadonlyArray<string> => {
  const trimmed = shortcut.trim()
  if (trimmed === "") return []
  const tokens = trimmed.split("+").map((t) => t.trim())
  const out: Array<string> = []
  for (let i = 0; i < tokens.length; i++) {
    if (tokens[i] === "" && i > 0) {
      if (out[out.length - 1] !== "+") out.push("+")
      continue
    }
    if (tokens[i] !== "") out.push(tokens[i])
  }
  return out
}

type CapLabel = Readonly<{ mac: () => string; other: () => string }>

const glyph = (label: string) => () => label

const CAP_LABELS: Readonly<Record<string, CapLabel>> = {
  mod: { mac: glyph("⌘"), other: m.common_key_ctrl },
  meta: { mac: glyph("⌘"), other: m.common_key_win },
  ctrl: { mac: glyph("⌃"), other: m.common_key_ctrl },
  alt: { mac: glyph("⌥"), other: m.common_key_alt },
  shift: { mac: glyph("⇧"), other: m.common_key_shift },
  enter: { mac: glyph("↵"), other: m.common_key_enter },
  escape: { mac: m.common_key_escape, other: m.common_key_escape },
  backspace: { mac: glyph("⌫"), other: m.common_key_backspace },
  delete: { mac: glyph("⌦"), other: m.common_key_delete },
  tab: { mac: glyph("⇥"), other: m.common_key_tab },
  " ": { mac: m.common_key_space, other: m.common_key_space },
  arrowup: { mac: glyph("↑"), other: glyph("↑") },
  arrowdown: { mac: glyph("↓"), other: glyph("↓") },
  arrowleft: { mac: glyph("←"), other: glyph("←") },
  arrowright: { mac: glyph("→"), other: glyph("→") }
}

const PREFORMATTED = /^[⌘⌃⌥⇧↵⌫⌦⇥↑↓←→]+[A-Za-z0-9]?$/

export function formatShortcut(
  shortcut: string,
  mac: boolean
): ReadonlyArray<string> {
  const caps: Array<string> = []
  for (const token of shortcutTokens(shortcut)) {
    if (PREFORMATTED.test(token)) {
      caps.push(...Array.from(token))
      continue
    }
    const lower = token.toLowerCase()
    const name = MODIFIER_TOKENS[lower] ?? KEY_ALIASES[lower] ?? lower
    const cap = CAP_LABELS[name]
    if (cap) caps.push(mac ? cap.mac() : cap.other())
    else if (name.length === 1) caps.push(name.toUpperCase())
    else caps.push(name.charAt(0).toUpperCase() + name.slice(1))
  }
  return caps
}

const isMacPlatform = (): boolean => {
  if (typeof navigator === "undefined") return false
  const nav = navigator as Navigator & { userAgentData?: { platform?: string } }
  const platform = nav.userAgentData?.platform ?? nav.platform ?? ""
  return /mac|iphone|ipad|ipod/i.test(platform)
}

let macPlatform: boolean | null = null
const readMac = () => (macPlatform ??= isMacPlatform())
const serverMac = () => true
const subscribeNever = () => () => {}

const useIsMac = (): boolean =>
  useSyncExternalStore(subscribeNever, readMac, serverMac)

const useIsoLayoutEffect =
  typeof window === "undefined" ? useEffect : useLayoutEffect

const sectionRows = (
  items: ReadonlyArray<CommandMenuItemData>
): ReadonlyArray<CommandMenuSection> => {
  const groups = new Map<string | null, Array<CommandMenuItemData>>()
  for (const item of items) {
    const heading = item.group ?? null
    const group = groups.get(heading)
    if (group === undefined) groups.set(heading, [item])
    else group.push(item)
  }
  let start = 0
  return [...groups].map(([heading, rows]) => {
    const section = {
      id: heading === null ? "ungrouped" : `group:${heading}`,
      heading,
      items: rows,
      start
    }
    start += rows.length
    return section
  })
}

type HighlightStore = Readonly<{
  get: () => number | null
  subscribe: (listener: () => void) => () => void
}>

type CommandMenuContextValue = Readonly<{
  sections: ReadonlyArray<CommandMenuSection>
  rows: ReadonlyArray<CommandMenuItemData>
  itemsByValue: ReadonlyMap<string, CommandMenuItemData>
  listId: string
  listRef: RefObject<HTMLDivElement | null>
  registerItem: UseFluidHoverReturn["registerItem"]
  setActiveIndex: Dispatch<SetStateAction<number | null>>
  listHandlers: UseFluidHoverReturn["handlers"]
  highlight: HighlightStore
  select: (item: CommandMenuItemData) => void
  move: (to: 1 | -1) => void
}>

const CommandMenuFillContext = createContext<FluidHoverSource | null>(null)

const CommandMenuContext = createContext<CommandMenuContextValue | null>(null)

function useCommandMenu(): CommandMenuContextValue {
  const ctx = useContext(CommandMenuContext)
  if (!ctx)
    throw new Error(
      "CommandMenu compound components must be inside <CommandMenu>"
    )
  return ctx
}

const CommandMenuIndexContext = createContext<number>(0)

export type CommandMenuProps = Omit<
  HTMLAttributes<HTMLDivElement>,
  "onSelect"
> &
  Readonly<{
    items: ReadonlyArray<CommandMenuItemData>
    onSelect?: (item: CommandMenuItemData) => void
    stretch?: boolean
    children: ReactNode
  }>

function CommandMenu({
  items,
  onSelect,
  stretch = false,
  className,
  children,
  ref,
  ...props
}: CommandMenuProps & Readonly<{ ref?: Ref<HTMLDivElement> }>) {
  const listId = useId()
  const listRef = useRef<HTMLDivElement | null>(null)

  const itemsByValue = useMemo(
    () => new Map(items.map((item) => [item.value, item] as const)),
    [items]
  )

  const sections = useMemo(() => sectionRows(items), [items])
  const rows = useMemo(() => sections.flatMap((s) => s.items), [sections])
  const rowsKey = rows.map((row) => row.value).join("\u0000")

  const hover = useFluidHover(listRef)
  const {
    activeIndex,
    setActiveIndex,
    registerItem,
    itemRects,
    isMeasured,
    sessionRef
  } = hover
  const { onMouseEnter, onMouseMove, onMouseLeave, onClick } = hover.handlers
  const listHandlers = useMemo(
    () => ({ onMouseEnter, onMouseMove, onMouseLeave, onClick }),
    [onMouseEnter, onMouseMove, onMouseLeave, onClick]
  )

  const highlightRef = useRef<number | null>(null)
  const listenersRef = useRef(new Set<() => void>())
  const highlight = useMemo<HighlightStore>(
    () => ({
      get: () => highlightRef.current,
      subscribe: (listener) => {
        listenersRef.current.add(listener)
        return () => {
          listenersRef.current.delete(listener)
        }
      }
    }),
    []
  )
  useIsoLayoutEffect(() => {
    highlightRef.current = activeIndex
    listenersRef.current.forEach((listener) => listener())
  }, [activeIndex])
  const fill = useMemo<FluidHoverSource>(
    () => ({ activeIndex, itemRects, isMeasured, sessionRef }),
    [activeIndex, itemRects, isMeasured, sessionRef]
  )

  const reduceMotion = useReducedMotion() ?? false
  const scrollAnimationRef = useRef<{ stop: () => void } | null>(null)
  const scrollToRow = useCallback(
    (index: number, instant = false) => {
      const list = listRef.current
      const viewport = list?.closest<HTMLElement>(
        '[data-slot="scroll-area-viewport"]'
      )
      if (!list || !viewport) return
      scrollAnimationRef.current?.stop()
      scrollAnimationRef.current = null
      const row = list.querySelector<HTMLElement>(
        `[data-fluid-hover-index="${index}"]`
      )
      if (!row) return
      const maxScroll = viewport.scrollHeight - viewport.clientHeight
      const margin =
        Number.parseFloat(
          getComputedStyle(viewport).getPropertyValue("--scroll-fade-size")
        ) || 0
      const rowRect = row.getBoundingClientRect()
      const viewportTop = viewport.getBoundingClientRect().top
      const rowTop = rowRect.top - viewportTop + viewport.scrollTop - margin
      const rowBottom = rowTop + rowRect.height + margin * 2
      const visibleTop = viewport.scrollTop
      const visibleBottom = visibleTop + viewport.clientHeight
      const wanted =
        rowTop < visibleTop
          ? rowTop
          : rowBottom > visibleBottom
            ? rowBottom - viewport.clientHeight
            : null
      const target =
        index === 0
          ? 0
          : wanted === null
            ? visibleTop
            : Math.max(0, Math.min(wanted, maxScroll))
      if (target === visibleTop) return
      if (instant || reduceMotion) {
        viewport.scrollTop = target
        return
      }
      scrollAnimationRef.current = animate(viewport.scrollTop, target, {
        ...spring.fast,
        onUpdate: (value) => {
          viewport.scrollTop =
            Math.round(value * devicePixelRatio) / devicePixelRatio
        }
      })
    },
    [reduceMotion]
  )
  useEffect(() => () => scrollAnimationRef.current?.stop(), [])

  const rowsRef = useRef(rows)
  rowsRef.current = rows
  useEffect(() => {
    setActiveIndex(rowsRef.current.length === 0 ? null : 0)
    scrollToRow(0, true)
  }, [rowsKey, setActiveIndex, scrollToRow])

  const move = useCallback(
    (to: 1 | -1) => {
      const count = rowsRef.current.length
      if (count === 0) return
      const current = highlightRef.current
      const next =
        current === null
          ? to === 1
            ? 0
            : count - 1
          : (current + to + count) % count
      setActiveIndex(next)
      scrollToRow(next)
    },
    [setActiveIndex, scrollToRow]
  )

  const onSelectRef = useRef(onSelect)
  onSelectRef.current = onSelect
  const select = useCallback((item: CommandMenuItemData) => {
    onSelectRef.current?.(item)
  }, [])

  const ctx = useMemo<CommandMenuContextValue>(
    () => ({
      sections,
      rows,
      itemsByValue,
      listId,
      listRef,
      registerItem,
      setActiveIndex,
      listHandlers,
      highlight,
      select,
      move
    }),
    [
      sections,
      rows,
      itemsByValue,
      listId,
      registerItem,
      setActiveIndex,
      listHandlers,
      highlight,
      select,
      move
    ]
  )

  const columnRef = useRef<HTMLDivElement | null>(null)
  const [height, setHeight] = useState<number | null>(null)
  useEffect(() => {
    const el = columnRef.current
    if (!el || typeof ResizeObserver === "undefined") return
    const update = () => setHeight(el.offsetHeight)
    update()
    const ro = new ResizeObserver(update)
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  return (
    <CommandMenuContext.Provider value={ctx}>
      <CommandMenuFillContext.Provider value={fill}>
        <div
          ref={ref}
          data-slot="command-menu"
          className={cn(
            "relative max-h-[inherit] w-full overflow-hidden",
            className
          )}
          {...props}
        >
          <motion.div
            className={cn(
              "max-h-[inherit] overflow-hidden",
              stretch && "flex min-h-0 flex-1 flex-col"
            )}
            initial={false}
            animate={stretch || height === null ? {} : { height }}
            transition={reduceMotion ? { duration: 0 } : spring.moderate}
          >
            <div
              ref={columnRef}
              className={cn(
                "flex max-h-[inherit] min-h-0 flex-col",
                stretch && "flex-1"
              )}
            >
              {children}
            </div>
          </motion.div>
        </div>
      </CommandMenuFillContext.Provider>
    </CommandMenuContext.Provider>
  )
}

export type CommandMenuTab = Readonly<{
  value: string
  label: string
  icon?: IconComponent
  count?: number
}>

export type CommandMenuTabsProps = Omit<
  HTMLAttributes<HTMLDivElement>,
  "onSelect"
> &
  Readonly<{
    tabs: ReadonlyArray<CommandMenuTab>
    value: string
    onValueChange: (value: string) => void
    tabsLabel: string
  }>

function CommandMenuTabs({
  tabs,
  value,
  onValueChange,
  tabsLabel,
  className,
  ref,
  ...props
}: CommandMenuTabsProps & Readonly<{ ref?: Ref<HTMLDivElement> }>) {
  return (
    <div
      ref={ref}
      data-slot="command-menu-tabs"
      className={cn(
        "flex shrink-0 items-center",
        "gap-2 px-2.5 pb-2",
        className
      )}
      {...props}
    >
      <div
        onMouseDown={(e) => e.preventDefault()}
        className="flex min-w-0 flex-1 items-center"
      >
        <SegmentedTabs
          variant="subtle"
          aria-label={tabsLabel}
          value={value}
          onValueChange={onValueChange}
          items={tabs.map((tab) => ({
            key: tab.value,
            label: tab.label,
            icon: tab.icon,
            badge: tab.count
          }))}
        />
      </div>
    </div>
  )
}

export type CommandMenuInputProps = InputHTMLAttributes<HTMLInputElement>

function CommandMenuInput({
  className,
  onKeyDown,
  ref,
  ...props
}: CommandMenuInputProps & Readonly<{ ref?: Ref<HTMLInputElement> }>) {
  const { move, select, rows, highlight, listId } = useCommandMenu()
  const index = useSyncExternalStore(
    highlight.subscribe,
    highlight.get,
    () => null
  )
  return (
    <div
      data-slot="command-menu-input"
      className="flex h-9 shrink-0 items-center px-2"
    >
      <input
        ref={ref}
        role="combobox"
        aria-expanded
        aria-controls={listId}
        aria-autocomplete="list"
        aria-activedescendant={
          index === null ? undefined : `${listId}-${index}`
        }
        onKeyDown={(event) => {
          onKeyDown?.(event)
          if (event.defaultPrevented) return
          if (event.key === "ArrowDown" || event.key === "ArrowUp") {
            event.preventDefault()
            move(event.key === "ArrowDown" ? 1 : -1)
            return
          }
          if (event.key !== "Enter") return
          const current = highlight.get()
          const row = current === null ? undefined : rows[current]
          if (row === undefined) return
          event.preventDefault()
          select(row)
        }}
        className={cn(
          "h-9 w-full min-w-0 bg-transparent text-sm outline-hidden placeholder:text-muted-foreground",
          className
        )}
        {...props}
      />
    </div>
  )
}

export type CommandMenuListProps = HTMLAttributes<HTMLDivElement> &
  Readonly<{
    renderItem: (item: CommandMenuItemData, index: number) => ReactNode
    children?: ReactNode
  }>

function CommandMenuList({
  className,
  children,
  renderItem,
  ref,
  ...props
}: CommandMenuListProps & Readonly<{ ref?: Ref<HTMLDivElement> }>) {
  const { sections, rows, listId, listRef, setActiveIndex, listHandlers } =
    useCommandMenu()
  const fill = useContext(CommandMenuFillContext)
  const empty = rows.length === 0

  const lastActiveRef = useRef<number | null>(null)
  if (fill && fill.activeIndex !== null)
    lastActiveRef.current = fill.activeIndex
  const handleMouseLeave = () => {
    listHandlers.onMouseLeave()
    setActiveIndex(lastActiveRef.current)
  }

  return (
    <ScrollArea
      className="scroll-divider flex min-h-0 flex-1 flex-col border-t border-border/60 [&::after]:!hidden [&::before]:!-top-px"
      viewportClassName="min-h-0 flex-1 [&>div[style]]:!block [&>div[style]]:!min-w-0 ![--scroll-fade-size:12px] scroll-fade"
    >
      <div
        ref={(node) => {
          listRef.current = node
          if (typeof ref === "function") ref(node)
          else if (ref) ref.current = node
        }}
        id={listId}
        role="listbox"
        tabIndex={-1}
        data-slot="command-menu-list"
        data-empty={empty || undefined}
        onMouseEnter={listHandlers.onMouseEnter}
        onMouseMove={listHandlers.onMouseMove}
        onMouseLeave={handleMouseLeave}
        onClick={listHandlers.onClick}
        onMouseDown={(e) => e.preventDefault()}
        className={cn(
          "relative flex flex-col gap-1 p-1 outline-none data-[empty]:p-0",
          className
        )}
        {...props}
      >
        {fill && <FluidHoverHighlight hover={fill} className="rounded-lg" />}
        {children}
        {sections.map((section, sectionIndex) => {
          const headingId = section.heading
            ? `${listId}-group-${sectionIndex}`
            : undefined
          return (
            <div
              key={section.id}
              role="group"
              aria-labelledby={headingId}
              className="flex flex-col"
            >
              {section.heading && (
                <div
                  id={headingId}
                  role="presentation"
                  className={cn(
                    "flex shrink-0 items-center text-xs font-medium text-(--prose-quiet)",
                    "h-7 px-2"
                  )}
                >
                  {section.heading}
                </div>
              )}
              {section.items.map((item, i) => {
                const index = section.start + i
                return (
                  <CommandMenuIndexContext.Provider
                    key={item.value}
                    value={index}
                  >
                    {renderItem(item, index)}
                  </CommandMenuIndexContext.Provider>
                )
              })}
            </div>
          )
        })}
      </div>
    </ScrollArea>
  )
}

export type CommandMenuEmptyProps = HTMLAttributes<HTMLDivElement>

function CommandMenuEmpty({
  className,
  ref,
  ...props
}: CommandMenuEmptyProps & Readonly<{ ref?: Ref<HTMLDivElement> }>) {
  const { rows } = useCommandMenu()
  if (rows.length > 0) return null
  return (
    <div
      ref={ref}
      role="status"
      aria-live="polite"
      data-slot="command-menu-empty"
      className={cn(
        "px-3 py-6 text-center text-muted-foreground",
        "text-[13px]",
        className
      )}
      {...props}
    />
  )
}

export type CommandMenuShortcutProps = HTMLAttributes<HTMLElement> &
  Readonly<{
    keys: string | ReadonlyArray<string>
  }>

function CommandMenuShortcut({
  keys,
  className,
  ref,
  ...props
}: CommandMenuShortcutProps & Readonly<{ ref?: Ref<HTMLElement> }>) {
  const mac = useIsMac()
  const caps = (typeof keys === "string" ? [keys] : keys).flatMap((k) =>
    formatShortcut(k, mac)
  )
  return (
    <kbd
      ref={ref}
      data-slot="command-menu-shortcut"
      className={cn(
        "ml-auto inline-flex shrink-0 items-center gap-0.5 align-middle font-sans",
        className
      )}
      {...props}
    >
      {caps.map((cap, i) => (
        <span
          key={`${cap}-${i}`}
          className={cn(
            "flex items-center justify-center rounded-[5px] bg-hover text-muted-foreground",
            "h-5 min-w-5 px-1 text-[11px]"
          )}
        >
          {cap}
        </span>
      ))}
    </kbd>
  )
}

export type CommandMenuItemProps = Omit<
  HTMLAttributes<HTMLDivElement>,
  "onSelect"
> &
  Readonly<{
    value: string
    children: ReactNode
  }>

const CommandMenuItem = memo(function CommandMenuItem({
  value,
  className,
  onClick,
  children,
  ref,
  ...props
}: CommandMenuItemProps & Readonly<{ ref?: Ref<HTMLDivElement> }>) {
  const { itemsByValue, listId, registerItem, highlight, select } =
    useCommandMenu()
  const index = useContext(CommandMenuIndexContext)
  const internalRef = useRef<HTMLDivElement | null>(null)
  const isActive = useSyncExternalStore(
    highlight.subscribe,
    () => highlight.get() === index,
    () => false
  )

  const item = itemsByValue.get(value) ?? { value, label: value }
  const Icon = item.icon

  useRegisterFluidHoverItem(registerItem, index, internalRef)

  return (
    <div
      ref={(node) => {
        internalRef.current = node
        if (typeof ref === "function") ref(node)
        else if (ref) ref.current = node
      }}
      id={`${listId}-${index}`}
      role="option"
      aria-selected={isActive}
      data-fluid-hover-index={index}
      data-value={value}
      data-slot="command-menu-item"
      onClick={(e) => {
        onClick?.(e)
        if (!e.defaultPrevented) select(item)
      }}
      className={cn(
        "relative z-10 flex shrink-0 cursor-pointer items-center outline-none select-none",
        "h-9 gap-2 rounded-lg px-2 text-sm tracking-[-0.006em]",
        "transition-[color] duration-80",
        isActive ? "text-foreground" : "text-(--prose-body)",
        className
      )}
      {...props}
    >
      {Icon && (
        <Icon
          size={16}
          strokeWidth={1.75}
          className={cn(
            "shrink-0 transition-[color] duration-80",
            isActive ? "text-foreground" : "text-muted-foreground"
          )}
        />
      )}
      {children}
    </div>
  )
})

export type CommandMenuFooterProps = HTMLAttributes<HTMLDivElement> &
  Readonly<{
    children: ReactNode
  }>

function CommandMenuFooter({
  className,
  children,
  ref,
  ...props
}: CommandMenuFooterProps & Readonly<{ ref?: Ref<HTMLDivElement> }>) {
  return (
    <div
      ref={ref}
      data-slot="command-menu-footer"
      className={cn(
        "flex shrink-0 items-center overflow-hidden text-muted-foreground",
        "h-10 gap-4 px-4 text-[12px]",
        className
      )}
      {...props}
    >
      {children}
    </div>
  )
}

type ParsedShortcut = Readonly<{
  mod: boolean
  meta: boolean
  ctrl: boolean
  alt: boolean
  shift: boolean
  key: string
}>

const parseShortcut = (shortcut: string): ParsedShortcut => {
  const modifiers = new Set<string>()
  let key = ""
  for (const token of shortcutTokens(shortcut)) {
    const lower = token.toLowerCase()
    const modifier = MODIFIER_TOKENS[lower]
    if (modifier) modifiers.add(modifier)
    else key = KEY_ALIASES[lower] ?? lower
  }
  return {
    mod: modifiers.has("mod"),
    meta: modifiers.has("meta"),
    ctrl: modifiers.has("ctrl"),
    alt: modifiers.has("alt"),
    shift: modifiers.has("shift"),
    key
  }
}

const matchesShortcut = (
  event: KeyboardEvent,
  parsed: ParsedShortcut
): boolean => {
  if (parsed.key === "") return false
  const key = event.key.toLowerCase()
  const byCode =
    parsed.key.length === 1 &&
    /[a-z0-9]/.test(parsed.key) &&
    (event.altKey || !/^[a-z0-9]$/i.test(event.key)) &&
    event.code.toLowerCase() ===
      (/[a-z]/.test(parsed.key) ? `key${parsed.key}` : `digit${parsed.key}`)
  if (key !== parsed.key && !byCode) return false
  if (parsed.mod) {
    if (!event.metaKey && !event.ctrlKey) return false
  } else if (event.metaKey !== parsed.meta || event.ctrlKey !== parsed.ctrl) {
    return false
  }
  if (event.altKey !== parsed.alt) return false
  return !parsed.shift || event.shiftKey
}

const hasModifier = (parsed: ParsedShortcut): boolean =>
  parsed.mod || parsed.meta || parsed.ctrl || parsed.alt

const isEditable = (target: EventTarget | null): boolean =>
  target instanceof HTMLElement &&
  (target.isContentEditable ||
    ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName))

const comboKey = (parsed: ParsedShortcut): string =>
  [
    parsed.mod && "mod",
    parsed.meta && "meta",
    parsed.ctrl && "ctrl",
    parsed.alt && "alt",
    parsed.shift && "shift",
    parsed.key
  ]
    .filter(Boolean)
    .join("+")

const mountedDialogs: Array<
  Readonly<{ combo: string; isOpen: () => boolean }>
> = []

export type CommandMenuDialogProps = Readonly<{
  open: boolean
  onOpenChange: (open: boolean) => void
  pulseKey?: string
  shortcut?: string | null
  title: string
  className?: string
  children: ReactNode
}>

const PULSE_SCALE = 0.98
const PULSE_PRESS = { duration: 0.09, ease: "linear" } as const
const PULSE_RELEASE = {
  type: "spring",
  stiffness: 1900,
  damping: 118,
  restDelta: 0.002
} as const
const PANEL_RESIZE = {
  type: "spring",
  stiffness: 3200,
  damping: 118,
  restDelta: 0.5
} as const

type ContentSize = Readonly<{ height: number; instant: boolean }>

function CommandMenuDialog({
  open,
  onOpenChange,
  pulseKey,
  shortcut = "mod+k",
  title,
  className,
  children
}: CommandMenuDialogProps) {
  const openRef = useRef(open)
  const onOpenChangeRef = useRef(onOpenChange)
  const popupRef = useRef<HTMLDivElement | null>(null)
  const lastPulseRef = useRef(pulseKey)
  const pulseOpenRef = useRef(open)
  const pulseRef = useRef<AnimationPlaybackControls | null>(null)
  const reduceMotion = useReducedMotion() ?? false
  useEffect(() => {
    const popup = popupRef.current
    const changed = lastPulseRef.current !== pulseKey
    const wasOpen = pulseOpenRef.current
    lastPulseRef.current = pulseKey
    pulseOpenRef.current = open
    if (!changed || !wasOpen || !open || popup === null || reduceMotion) return
    pulseRef.current?.stop()
    popup.style.transformOrigin = "center"
    const press = animate(popup, { scale: PULSE_SCALE }, PULSE_PRESS)
    pulseRef.current = press
    void press.then(() => {
      if (pulseRef.current !== press) return
      const release = animate(popup, { scale: 1 }, PULSE_RELEASE)
      pulseRef.current = release
      void release.then(() => {
        if (pulseRef.current !== release) return
        pulseRef.current = null
        popup.style.transformOrigin = ""
      })
    })
  }, [pulseKey, open, reduceMotion])
  useEffect(() => () => pulseRef.current?.stop(), [])
  const [content, setContent] = useState<ContentSize | null>(null)
  const observeContent = useCallback((node: HTMLDivElement | null) => {
    if (node === null) return undefined
    const measure = () => {
      node.style.height = "auto"
      const height = node.offsetHeight
      node.style.height = ""
      if (height === 0) return
      setContent((previous) =>
        previous?.height === height
          ? previous
          : { height, instant: previous === null }
      )
    }
    const resizes = new ResizeObserver(measure)
    resizes.observe(node)
    const mutations = new MutationObserver(measure)
    mutations.observe(node, { childList: true, subtree: true })
    return () => {
      resizes.disconnect()
      mutations.disconnect()
      setContent(null)
    }
  }, [])
  useIsoLayoutEffect(() => {
    openRef.current = open
    onOpenChangeRef.current = onOpenChange
  })

  useEffect(() => {
    if (!shortcut) return undefined
    const parsed = parseShortcut(shortcut)
    if (parsed.key === "") return undefined
    const entry = { combo: comboKey(parsed), isOpen: () => openRef.current }
    mountedDialogs.push(entry)
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.repeat || event.defaultPrevented) return
      if (!matchesShortcut(event, parsed)) return
      if (!hasModifier(parsed) && isEditable(event.target)) return
      const peers = mountedDialogs.filter((d) => d.combo === entry.combo)
      const answers = peers.find((d) => d.isOpen()) ?? peers.at(-1)
      if (answers !== entry) return
      event.preventDefault()
      onOpenChangeRef.current(!openRef.current)
    }
    window.addEventListener("keydown", onKeyDown)
    return () => {
      window.removeEventListener("keydown", onKeyDown)
      const index = mountedDialogs.indexOf(entry)
      if (index !== -1) mountedDialogs.splice(index, 1)
    }
  }, [shortcut])

  return (
    <DialogPrimitive.Root open={open} onOpenChange={onOpenChange}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Backdrop
          data-slot="command-menu-backdrop"
          className="fixed inset-0 bg-black/15 data-[closed]:animate-out data-[closed]:fade-out-0 data-[open]:animate-in data-[open]:fade-in-0 motion-reduce:animate-none dark:bg-black/40"
        />
        <DialogPrimitive.Popup
          ref={popupRef}
          data-slot="command-menu-dialog"
          className={cn(
            "fixed inset-x-0 top-[round(down,max(12dvh,calc(50dvh-220px)),1px)] mx-auto flex w-[min(40rem,calc(100vw-2rem))] flex-col overflow-hidden rounded-xl border border-border/60 bg-popover text-foreground shadow-[0_16px_48px_rgba(0,0,0,0.12)] outline-none dark:shadow-[0_16px_48px_rgba(0,0,0,0.6)]",
            "origin-top data-[closed]:animate-out data-[closed]:fade-out-0 data-[closed]:zoom-out-[0.98] data-[open]:animate-in data-[open]:fade-in-0 data-[open]:zoom-in-[0.98] motion-reduce:animate-none",
            className
          )}
        >
          <DialogPrimitive.Title className="sr-only">
            {title}
          </DialogPrimitive.Title>
          <motion.div
            className="overflow-hidden"
            initial={false}
            animate={content === null ? {} : { height: content.height }}
            transition={
              reduceMotion || content === null || content.instant
                ? { duration: 0 }
                : PANEL_RESIZE
            }
          >
            <div
              ref={observeContent}
              className="flex h-full max-h-[min(440px,76dvh)] flex-col"
            >
              {children}
            </div>
          </motion.div>
        </DialogPrimitive.Popup>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  )
}

export {
  useCommandMenu,
  CommandMenu,
  CommandMenuDialog,
  CommandMenuTabs,
  CommandMenuInput,
  CommandMenuList,
  CommandMenuEmpty,
  CommandMenuItem,
  CommandMenuShortcut,
  CommandMenuFooter
}
