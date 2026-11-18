import type { Library } from "@pp/shared"
import {
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  type CSSProperties,
  type ReactNode,
  type Ref,
  type RefObject
} from "react"

import {
  CommandMenu,
  CommandMenuEmpty,
  CommandMenuFooter,
  CommandMenuFooterHint,
  CommandMenuItem,
  CommandMenuList,
  CommandMenuShortcut,
  CommandMenuTabs,
  useCommandMenu,
  useHighlightedItem,
  type CommandMenuItemData
} from "../../components/command-menu"
import { popupSurfaceClass } from "../../components/menu-styles"
import { keyLabelsFrom } from "../../lib/keyLabels"
import { cn } from "../../lib/utils"
import { m } from "../messages"
import { SLASH_MENU_BODY_REM } from "./slash-menu-fit"
import {
  ItemIcon,
  itemIcon,
  itemLiteral,
  itemMeta,
  itemName,
  itemShortcut,
  SECTION_LABELS,
  TAB_LABELS
} from "./slash-menu-item"
import type {
  SlashItem,
  SlashSection,
  SlashTab,
  SlashTabCount
} from "./slash-menu-items"
import { SlashMenuPreview } from "./slash-menu-preview"

export type SlashMenuModel = Readonly<{
  tab: SlashTab
  tabs: ReadonlyArray<SlashTabCount>
  sections: ReadonlyArray<SlashSection>
}>

const showsSectionLabel = (menu: SlashMenuModel) =>
  menu.tab === "all" || menu.sections.length > 1

function SlashMenuPreviewPane({
  items,
  library
}: Readonly<{
  items: ReadonlyMap<string, SlashItem>
  library: Library
}>) {
  const row = useHighlightedItem()
  const item = row === undefined ? undefined : items.get(row.value)
  return (
    <div
      data-slash-menu-preview
      className="flex min-w-0 flex-1 border-t border-l border-border/60"
    >
      {item === undefined ? null : (
        <SlashMenuPreview
          item={item}
          icon={<ItemIcon item={item} />}
          name={itemName(item)}
          meta={itemMeta(item)}
          library={library}
        />
      )}
    </div>
  )
}

function SlashMenuFooter({ tabs }: Readonly<{ tabs: boolean }>) {
  const row = useHighlightedItem()
  return (
    <CommandMenuFooter>
      <CommandMenuFooterHint
        keyLabels={keyLabelsFrom(m)}
        label={m.editor_slash_footer_select()}
        keys="↑↓"
      />
      {tabs ? (
        <CommandMenuFooterHint
          keyLabels={keyLabelsFrom(m)}
          label={m.editor_slash_tabs_label()}
          keys="tab"
        />
      ) : null}
      {row === undefined ? null : (
        <span className="ml-auto flex min-w-0 items-center gap-1.5 text-foreground">
          <span className="truncate">{row.label}</span>
          <CommandMenuShortcut
            keyLabels={keyLabelsFrom(m)}
            keys="enter"
            className="ml-0"
          />
        </span>
      )}
    </CommandMenuFooter>
  )
}

function SlashMenuRow({
  item,
  detachRef
}: Readonly<{ item: SlashItem; detachRef: RefObject<boolean> }>) {
  const meta = itemMeta(item)
  const literal = itemLiteral(item)
  const shortcut = itemShortcut(item)
  return (
    <CommandMenuItem
      value={item.key}
      onClick={(event) => {
        detachRef.current = event.altKey
      }}
    >
      <span className="min-w-0 flex-1 truncate">{itemName(item)}</span>
      {meta ? (
        <span className="shrink-0 text-caption text-muted-foreground">
          {meta}
        </span>
      ) : null}
      {literal ? (
        <code className="shrink-0 font-mono text-micro text-muted-foreground">
          {literal}
        </code>
      ) : null}
      {shortcut ? (
        <span className="shrink-0 text-caption text-muted-foreground">
          {shortcut}
        </span>
      ) : null}
    </CommandMenuItem>
  )
}

// Arrow keys, Enter (Alt+Enter detaches a synced block) and the active
// descendant, from a text input that keeps focus while the menu is open.
export function SlashMenuInputKeys({
  input,
  detachRef
}: Readonly<{
  input: HTMLInputElement | null
  detachRef: RefObject<boolean>
}>) {
  const { move, select, rows, highlight, listId } = useCommandMenu()
  const rowsRef = useRef(rows)
  useLayoutEffect(() => {
    rowsRef.current = rows
  }, [rows])

  useEffect(() => {
    if (input === null) return undefined
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "ArrowDown" || event.key === "ArrowUp") {
        event.preventDefault()
        move(event.key === "ArrowDown" ? 1 : -1, event.repeat)
        return
      }
      if (event.key !== "Enter") return
      const index = highlight.get()
      const row = index === null ? undefined : rowsRef.current[index]
      if (row === undefined) return
      event.preventDefault()
      detachRef.current = event.altKey
      select(row)
    }
    const point = () => {
      const index = highlight.get()
      if (index === null) input.removeAttribute("aria-activedescendant")
      else input.setAttribute("aria-activedescendant", `${listId}-${index}`)
    }
    point()
    input.setAttribute("aria-controls", listId)
    input.addEventListener("keydown", onKeyDown)
    const unsubscribe = highlight.subscribe(point)
    return () => {
      input.removeEventListener("keydown", onKeyDown)
      unsubscribe()
    }
  }, [detachRef, highlight, input, listId, move, select])

  return null
}

export type SlashMenuProps = Readonly<{
  menu: SlashMenuModel
  query: string
  library: Library
  // Shows the highlighted item's preview beside the list (needs the width).
  preview: boolean
  // Set to true when the pick should detach a synced block (Alt).
  detachRef: RefObject<boolean>
  onPick: (key: string) => void
  onTab: (tab: SlashTab) => void
  // What drives the keyboard: SlashMenuKeys in the editor,
  // SlashMenuInputKeys from an input.
  keys: ReactNode
  ref?: Ref<HTMLDivElement>
  className?: string
  style?: CSSProperties
}> &
  Readonly<Record<`data-${string}`, string | undefined>>

/*
 * SlashMenu: what "/" opens in the editor: tabs (all, blocks, Markdown),
 * the items in sections, a preview of the highlighted one, and a footer
 * with the keys. Positioning and the keyboard belong to whoever opens it.
 */
export function SlashMenu({
  menu,
  query,
  library,
  preview,
  detachRef,
  onPick,
  onTab,
  keys,
  ref,
  className,
  style,
  ...data
}: SlashMenuProps) {
  const labelled = showsSectionLabel(menu)
  const hasTabs = menu.tabs.length > 1

  const itemsByKey = useMemo(
    () =>
      new Map(
        menu.sections.flatMap((section) =>
          section.items.map((item) => [item.key, item] as const)
        )
      ),
    [menu.sections]
  )
  const items = useMemo(
    () =>
      menu.sections.flatMap((section) =>
        section.items.map(
          (item) =>
            ({
              value: item.key,
              label: itemName(item),
              icon: itemIcon(item),
              group: SECTION_LABELS[section.section]()
            }) satisfies CommandMenuItemData
        )
      ),
    [menu.sections]
  )
  const tabs = useMemo(
    () =>
      menu.tabs.map((entry) => ({
        value: entry.tab,
        label: TAB_LABELS[entry.tab](),
        count: entry.count
      })),
    [menu.tabs]
  )

  return (
    <div
      ref={ref}
      role="presentation"
      style={style}
      {...data}
      className={cn(
        // The popups' surface (Popover, menus): card, hairline, 19px corners.
        popupSurfaceClass,
        "flex w-[28rem] max-w-[calc(100vw-2rem)] flex-col overflow-hidden",
        !hasTabs && "[&_.scroll-divider]:border-t-0",
        className
      )}
    >
      <CommandMenu items={items} onSelect={(row) => onPick(row.value)}>
        {keys}
        {hasTabs ? (
          <CommandMenuTabs
            tabs={tabs}
            value={menu.tab}
            tabsLabel={m.editor_slash_tabs_label()}
            onValueChange={(next) => {
              const entry = menu.tabs.find(
                (candidate) => candidate.tab === next
              )
              if (entry !== undefined) onTab(entry.tab)
            }}
          />
        ) : null}
        <div
          className="flex min-h-0"
          style={{ height: `${SLASH_MENU_BODY_REM}rem` }}
        >
          <div
            className={cn(
              "flex min-w-0 flex-col",
              preview ? "w-[28rem] shrink-0" : "flex-1"
            )}
          >
            <CommandMenuList
              aria-label={m.editor_slash_label()}
              className={cn(
                !labelled && "[&_[role=group]>[role=presentation]]:hidden"
              )}
              renderItem={(row) => {
                const item = itemsByKey.get(row.value)
                return item === undefined ? null : (
                  <SlashMenuRow item={item} detachRef={detachRef} />
                )
              }}
            >
              <CommandMenuEmpty className="py-2 text-left text-body">
                {m.editor_slash_empty({ query })}
              </CommandMenuEmpty>
            </CommandMenuList>
          </div>
          {preview ? (
            <SlashMenuPreviewPane items={itemsByKey} library={library} />
          ) : null}
        </div>
        <SlashMenuFooter tabs={hasTabs} />
      </CommandMenu>
    </div>
  )
}

// The slash menu in the editor: fixed under (or over) the "/" it was typed
// at, fitted to the editor's width, driven by the editor's keys.
