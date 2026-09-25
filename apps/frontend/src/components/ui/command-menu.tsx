"use client"

import { animate, motion, useReducedMotion } from "motion/react"
import {
  createContext,
  forwardRef,
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
  type ReactNode,
  type RefObject,
  type SetStateAction
} from "react"

import {
  FluidHoverHighlight,
  type FluidHoverSource
} from "@/components/fluid-hover-highlight"
import { ScrollArea } from "@/components/ui/scroll-area"
import { TabsSubtle, TabsSubtleItem } from "@/components/ui/tabs-subtle"
import {
  useFluidHover,
  useRegisterFluidHoverItem,
  type UseFluidHoverReturn
} from "@/hooks/use-fluid-hover"
import type { IconComponent } from "@/lib/icon-context"
import { shapeMap } from "@/lib/shape-context"
import { useSize } from "@/lib/size-context"
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

const listShape = shapeMap.rounded

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
    children: ReactNode
  }>

const CommandMenu = forwardRef<HTMLDivElement, CommandMenuProps>(
  ({ items, onSelect, className, children, ...props }, ref) => {
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
      (index: number) => {
        const list = listRef.current
        const viewport = list?.closest<HTMLElement>(
          '[data-slot="scroll-area-viewport"]'
        )
        if (!list || !viewport) return
        scrollAnimationRef.current?.stop()
        scrollAnimationRef.current = null
        if (index === 0) {
          viewport.scrollTop = 0
          return
        }
        const row = list.querySelector<HTMLElement>(
          `[data-fluid-hover-index="${index}"]`
        )
        if (!row) return
        const rowTop = row.offsetTop + list.offsetTop
        const target = Math.max(
          0,
          Math.min(
            rowTop + row.offsetHeight / 2 - viewport.clientHeight / 2,
            viewport.scrollHeight - viewport.clientHeight
          )
        )
        if (reduceMotion) {
          viewport.scrollTop = target
          return
        }
        scrollAnimationRef.current = animate(viewport.scrollTop, target, {
          ...spring.fast,
          onUpdate: (value) => {
            viewport.scrollTop = value
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
      scrollToRow(0)
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
              className="max-h-[inherit] overflow-hidden"
              initial={false}
              animate={height === null ? {} : { height }}
              transition={reduceMotion ? { duration: 0 } : spring.moderate}
            >
              <div
                ref={columnRef}
                className="flex max-h-[inherit] min-h-0 flex-col"
              >
                {children}
              </div>
            </motion.div>
          </div>
        </CommandMenuFillContext.Provider>
      </CommandMenuContext.Provider>
    )
  }
)

CommandMenu.displayName = "CommandMenu"

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

const CommandMenuTabs = forwardRef<HTMLDivElement, CommandMenuTabsProps>(
  ({ tabs, value, onValueChange, tabsLabel, className, ...props }, ref) => {
    const compact = useSize().variant === "compact"
    const selectedIndex = Math.max(
      0,
      tabs.findIndex((tab) => tab.value === value)
    )

    return (
      <div
        ref={ref}
        data-slot="command-menu-tabs"
        className={cn(
          "flex shrink-0 items-center",
          compact ? "gap-1 px-2 pb-1.5" : "gap-2 px-2.5 pb-2",
          className
        )}
        {...props}
      >
        <div
          onMouseDown={(e) => e.preventDefault()}
          className="flex min-w-0 flex-1 items-center"
        >
          <TabsSubtle
            size="compact"
            shape="rounded"
            selectedIndex={selectedIndex}
            onSelect={(index) => {
              const tab = tabs[index]
              if (tab) onValueChange(tab.value)
            }}
            aria-label={tabsLabel}
          >
            {tabs.map((tab, index) => (
              <TabsSubtleItem
                key={tab.value}
                index={index}
                label={tab.label}
                icon={tab.icon}
                count={tab.count}
              />
            ))}
          </TabsSubtle>
        </div>
      </div>
    )
  }
)

CommandMenuTabs.displayName = "CommandMenuTabs"

export type CommandMenuListProps = HTMLAttributes<HTMLDivElement> &
  Readonly<{
    renderItem: (item: CommandMenuItemData, index: number) => ReactNode
    children?: ReactNode
  }>

const CommandMenuList = forwardRef<HTMLDivElement, CommandMenuListProps>(
  ({ className, children, renderItem, ...props }, ref) => {
    const { sections, rows, listId, listRef, setActiveIndex, listHandlers } =
      useCommandMenu()
    const fill = useContext(CommandMenuFillContext)
    const compact = useSize().variant === "compact"
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
        className="scroll-divider flex min-h-0 flex-1 flex-col border-t border-border/60 [&::before]:!-top-px"
        viewportClassName="min-h-0 flex-1 [&>div[style]]:!block [&>div[style]]:!min-w-0 [--scroll-fade-size:32px] scroll-fade"
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
          {fill && (
            <FluidHoverHighlight hover={fill} className={listShape.bg} />
          )}
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
                      "flex shrink-0 items-center text-xs text-muted-foreground",
                      compact ? "h-6 px-1.5" : "h-7 px-2"
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
)

CommandMenuList.displayName = "CommandMenuList"

export type CommandMenuEmptyProps = HTMLAttributes<HTMLDivElement>

const CommandMenuEmpty = forwardRef<HTMLDivElement, CommandMenuEmptyProps>(
  ({ className, ...props }, ref) => {
    const { rows } = useCommandMenu()
    const sizeClasses = useSize()
    if (rows.length > 0) return null
    return (
      <div
        ref={ref}
        role="status"
        aria-live="polite"
        data-slot="command-menu-empty"
        className={cn(
          "px-3 py-6 text-center text-muted-foreground",
          sizeClasses.text,
          className
        )}
        {...props}
      />
    )
  }
)

CommandMenuEmpty.displayName = "CommandMenuEmpty"

export type CommandMenuShortcutProps = HTMLAttributes<HTMLElement> &
  Readonly<{
    keys: string | ReadonlyArray<string>
  }>

const CommandMenuShortcut = forwardRef<HTMLElement, CommandMenuShortcutProps>(
  ({ keys, className, ...props }, ref) => {
    const mac = useIsMac()
    const compact = useSize().variant === "compact"
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
              compact
                ? "h-4 min-w-4 px-1 text-[10px]"
                : "h-5 min-w-5 px-1 text-[11px]"
            )}
          >
            {cap}
          </span>
        ))}
      </kbd>
    )
  }
)

CommandMenuShortcut.displayName = "CommandMenuShortcut"

export type CommandMenuItemProps = Omit<
  HTMLAttributes<HTMLDivElement>,
  "onSelect"
> &
  Readonly<{
    value: string
    children: ReactNode
  }>

const CommandMenuItem = memo(
  forwardRef<HTMLDivElement, CommandMenuItemProps>(
    ({ value, className, onClick, children, ...props }, ref) => {
      const { itemsByValue, listId, registerItem, highlight, select } =
        useCommandMenu()
      const index = useContext(CommandMenuIndexContext)
      const internalRef = useRef<HTMLDivElement | null>(null)
      const sizeClasses = useSize()
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
            sizeClasses.control,
            sizeClasses.gap,
            sizeClasses.itemPx,
            sizeClasses.text,
            listShape.item,
            "transition-[color] duration-80",
            isActive ? "text-foreground" : "text-muted-foreground",
            className
          )}
          {...props}
        >
          {Icon && (
            <Icon
              size={sizeClasses.icon}
              strokeWidth={isActive ? 2 : 1.5}
              className="shrink-0 transition-[color,stroke-width] duration-80"
            />
          )}
          {children}
        </div>
      )
    }
  )
)

CommandMenuItem.displayName = "CommandMenuItem"

export type CommandMenuFooterProps = HTMLAttributes<HTMLDivElement> &
  Readonly<{
    children: ReactNode
  }>

const CommandMenuFooter = forwardRef<HTMLDivElement, CommandMenuFooterProps>(
  ({ className, children, ...props }, ref) => {
    const compact = useSize().variant === "compact"
    return (
      <div
        ref={ref}
        data-slot="command-menu-footer"
        className={cn(
          "flex shrink-0 items-center overflow-hidden text-muted-foreground",
          compact
            ? "h-8 gap-3 px-3 text-[11px]"
            : "h-10 gap-4 px-4 text-[12px]",
          className
        )}
        {...props}
      >
        {children}
      </div>
    )
  }
)

CommandMenuFooter.displayName = "CommandMenuFooter"

export {
  useCommandMenu,
  CommandMenu,
  CommandMenuTabs,
  CommandMenuList,
  CommandMenuEmpty,
  CommandMenuItem,
  CommandMenuShortcut,
  CommandMenuFooter
}
