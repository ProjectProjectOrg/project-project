import { $createCodeNode } from "@lexical/code"
import { INSERT_HORIZONTAL_RULE_COMMAND } from "@lexical/extension"
import {
  INSERT_CHECK_LIST_COMMAND,
  INSERT_ORDERED_LIST_COMMAND,
  INSERT_UNORDERED_LIST_COMMAND
} from "@lexical/list"
import { $convertToMarkdownString, type Transformer } from "@lexical/markdown"
import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext"
import {
  LexicalTypeaheadMenuPlugin,
  MenuOption
} from "@lexical/react/LexicalTypeaheadMenuPlugin"
import { $createHeadingNode, $createQuoteNode } from "@lexical/rich-text"
import { $setBlocksType } from "@lexical/selection"
import { INSERT_TABLE_COMMAND } from "@lexical/table"
import { mergeRegister } from "@lexical/utils"
import {
  expandTemplate,
  formatTicketBlock,
  stripHints,
  type BlockDefinition,
  type BlockIconName,
  type BlockLookup,
  type Library,
  type TicketType
} from "@pp/shared"
import { useRouter } from "@tanstack/react-router"
import {
  $getRoot,
  $getSelection,
  $isRangeSelection,
  COMMAND_PRIORITY_CRITICAL,
  COMMAND_PRIORITY_EDITOR,
  createCommand,
  KEY_ARROW_DOWN_COMMAND,
  KEY_ARROW_UP_COMMAND,
  KEY_ENTER_COMMAND,
  KEY_TAB_COMMAND,
  type LexicalCommand,
  type LexicalEditor,
  type TextNode
} from "lexical"
import {
  Heading2,
  LibraryBig,
  List,
  ListOrdered,
  ListTodo,
  Minus,
  SquareCode,
  Table2,
  TextCursorInput,
  TextQuote,
  type LucideIcon
} from "lucide-react"
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
  type RefObject
} from "react"
import { createPortal } from "react-dom"

import { lookupFor } from "@/components/blocks/blockChrome"
import { BlockIconGlyph } from "@/components/Library/BlockIconGlyph"
import {
  CommandMenu,
  CommandMenuEmpty,
  CommandMenuFooter,
  CommandMenuItem,
  CommandMenuList,
  CommandMenuShortcut,
  CommandMenuTabs,
  useCommandMenu,
  type CommandMenuItemData
} from "@/components/ui/command-menu"
import { blockIconComponent } from "@/lib/block-icons"
import type { IconComponent } from "@/lib/icon-context"
import { cn } from "@/lib/utils"
import { m } from "@/paraglide/messages"

import { $applyTemplate, $insertBlocksAt } from "./blockCommands"
import type { EditorBlocksMode } from "./editorBlocks"
import { $createHintNode } from "./HintNode"
import {
  fitSlashMenu,
  placeSlashMenu,
  SLASH_MENU_BODY_REM,
  SLASH_MENU_FULL_REM,
  SLASH_MENU_LIST_REM,
  slashMenuBounds,
  slashMenuSpan,
  type SlashMenuFit,
  type SlashMenuPlacement
} from "./slashMenuFit"
import {
  cycleSlashTab,
  slashMenuView,
  slashTriggerMatch,
  type SlashBasicKind,
  type SlashItem,
  type SlashSection,
  type SlashSectionKey,
  type SlashTab,
  type SlashTabCount
} from "./slashMenuItems"
import { BASIC_LITERALS, SlashMenuPreview } from "./SlashMenuPreview"

export const OPEN_SLASH_MENU_COMMAND: LexicalCommand<SlashTab | null> =
  createCommand("OPEN_SLASH_MENU_COMMAND")

function $typeSlashTrigger() {
  const current = $getSelection()
  if (!$isRangeSelection(current)) $getRoot().selectStart()
  const selection = $getSelection()
  if (!$isRangeSelection(selection)) return
  const before = selection.anchor.getNode().getTextContent()
  const offset = selection.anchor.offset
  const needsSpace = offset > 0 && !/\s/.test(before[offset - 1] ?? "")
  selection.insertText(needsSpace ? " /" : "/")
}

class SlashMenuOption extends MenuOption {
  constructor(public readonly item: SlashItem) {
    super(item.key)
  }
}

const BASIC_LABELS: Record<SlashBasicKind, () => string> = {
  heading: m.editor_slash_basic_heading,
  checklist: m.editor_slash_basic_checklist,
  "bullet-list": m.editor_slash_basic_bullet_list,
  "numbered-list": m.editor_slash_basic_numbered_list,
  code: m.editor_slash_basic_code,
  quote: m.editor_slash_basic_quote,
  divider: m.editor_slash_basic_divider,
  table: m.editor_slash_basic_table,
  hint: m.editor_slash_basic_hint
}

const BASIC_ICONS: Record<SlashBasicKind, LucideIcon> = {
  heading: Heading2,
  checklist: ListTodo,
  "bullet-list": List,
  "numbered-list": ListOrdered,
  code: SquareCode,
  quote: TextQuote,
  divider: Minus,
  table: Table2,
  hint: TextCursorInput
}

const SECTION_LABELS: Record<SlashSectionKey, () => string> = {
  suggested: m.editor_slash_section_suggested,
  blocks: m.editor_slash_section_blocks,
  templates: m.editor_slash_section_templates,
  basic: m.editor_slash_section_basic
}

const TAB_LABELS: Record<SlashTab, () => string> = {
  all: m.editor_slash_tab_all,
  blocks: m.editor_slash_section_blocks,
  templates: m.editor_slash_section_templates,
  markdown: m.editor_slash_section_basic
}

const GALLERY_LABELS = {
  block: m.editor_slash_gallery_blocks,
  template: m.editor_slash_gallery_templates
}

const ORIGIN_LABELS = {
  org: m.editor_block_origin_org,
  project: m.editor_block_origin_project
}

const basicLabel = (kind: SlashBasicKind): string => BASIC_LABELS[kind]()

const blockMarkdown = (
  definition: BlockDefinition,
  detach: boolean,
  mode: EditorBlocksMode
): string => {
  if (mode === "template" && !detach)
    return formatTicketBlock(definition.key, "")
  return formatTicketBlock(definition.key, stripHints(definition.content), {
    sync: definition.sync && !detach && mode !== "template"
  })
}

function $insertHint() {
  const selection = $getSelection()
  if (!$isRangeSelection(selection)) return
  const text = `{{${m.editor_slash_hint_placeholder()}}}`
  const hint = $createHintNode(text)
  selection.insertNodes([hint])
  hint.select(2, text.length - 2)
}

function $insertBasic(editor: LexicalEditor, kind: SlashBasicKind) {
  const selection = $getSelection()
  switch (kind) {
    case "heading":
      if ($isRangeSelection(selection))
        $setBlocksType(selection, () => $createHeadingNode("h2"))
      return
    case "quote":
      if ($isRangeSelection(selection))
        $setBlocksType(selection, () => $createQuoteNode())
      return
    case "code":
      if ($isRangeSelection(selection))
        $setBlocksType(selection, () => $createCodeNode())
      return
    case "checklist":
      editor.dispatchCommand(INSERT_CHECK_LIST_COMMAND, undefined)
      return
    case "bullet-list":
      editor.dispatchCommand(INSERT_UNORDERED_LIST_COMMAND, undefined)
      return
    case "numbered-list":
      editor.dispatchCommand(INSERT_ORDERED_LIST_COMMAND, undefined)
      return
    case "divider":
      editor.dispatchCommand(INSERT_HORIZONTAL_RULE_COMMAND, undefined)
      return
    case "table":
      editor.dispatchCommand(INSERT_TABLE_COMMAND, {
        columns: "3",
        rows: "3",
        includeHeaders: { rows: true, columns: false }
      })
      return
    case "hint":
      $insertHint()
  }
}

export function $runSlashItem(
  editor: LexicalEditor,
  item: SlashItem,
  context: Readonly<{
    transformers: ReadonlyArray<Transformer>
    lookup: BlockLookup
    detach: boolean
    mode?: EditorBlocksMode
  }>
) {
  switch (item.kind) {
    case "block":
      $insertBlocksAt(
        blockMarkdown(
          item.definition,
          context.detach,
          context.mode ?? "ticket"
        ),
        context.transformers,
        context.lookup
      )
      return
    case "template":
      $applyTemplate(
        expandTemplate(item.template, context.lookup),
        context.transformers,
        context.lookup
      )
      return
    case "basic":
      $insertBasic(editor, item.basic)
      return
    case "gallery":
      return
  }
}

function ItemIcon({ item }: Readonly<{ item: SlashItem }>) {
  if (item.kind === "block")
    return (
      <BlockIconGlyph
        icon={item.definition.icon}
        color={item.definition.color}
      />
    )
  if (item.kind === "template")
    return (
      <BlockIconGlyph icon={item.template.icon} color={item.template.color} />
    )
  const Icon = item.kind === "gallery" ? LibraryBig : BASIC_ICONS[item.basic]
  return (
    <Icon
      aria-hidden
      strokeWidth={1.75}
      className="size-4 shrink-0 text-muted-foreground"
    />
  )
}

const glyphs = new Map<string, IconComponent>()

const glyphIcon = (
  icon: BlockIconName,
  color: string | null
): IconComponent => {
  const key = `${icon}:${color ?? ""}`
  const cached = glyphs.get(key)
  if (cached !== undefined) return cached
  const Icon = blockIconComponent(icon)
  const Glyph: IconComponent = ({ size, strokeWidth, className }) => (
    <Icon
      aria-hidden
      data-block-icon={icon}
      size={size}
      strokeWidth={strokeWidth}
      className={className}
      style={color === null ? undefined : { color }}
    />
  )
  glyphs.set(key, Glyph)
  return Glyph
}

const itemIcon = (item: SlashItem): IconComponent => {
  if (item.kind === "block")
    return glyphIcon(item.definition.icon, item.definition.color)
  if (item.kind === "template")
    return glyphIcon(item.template.icon, item.template.color)
  return item.kind === "gallery" ? LibraryBig : BASIC_ICONS[item.basic]
}

const itemName = (item: SlashItem): string => {
  if (item.kind === "block") return item.definition.name
  if (item.kind === "template") return item.template.name
  if (item.kind === "gallery") return GALLERY_LABELS[item.entry]()
  return basicLabel(item.basic)
}

const blockMeta = (definition: BlockDefinition): string | null => {
  if (definition.sync) return m.editor_slash_synced()
  return ORIGIN_LABELS[definition.origin]()
}

const templateMeta = (adds: number): string => {
  if (adds === 0) return m.editor_slash_template_applied()
  return adds === 1
    ? m.editor_slash_template_adds_one()
    : m.editor_slash_template_adds({ count: adds })
}

const itemMeta = (item: SlashItem): string | null => {
  if (item.kind === "block")
    return item.suggestedBy ?? blockMeta(item.definition)
  if (item.kind === "template") return templateMeta(item.adds)
  if (item.kind === "gallery") return m.editor_slash_gallery_browse()
  return null
}

const itemLiteral = (item: SlashItem): string | null =>
  item.kind === "basic" ? BASIC_LITERALS[item.basic] : null

const itemShortcut = (item: SlashItem): string | null =>
  item.kind === "block" && item.definition.sync
    ? m.editor_slash_copy_hint()
    : null

type SlashMenuState = Readonly<{
  tab: SlashTab
  tabs: ReadonlyArray<SlashTabCount>
  sections: ReadonlyArray<SlashSection>
  options: Array<SlashMenuOption>
}>

const EMPTY_MENU: SlashMenuState = {
  tab: "all",
  tabs: [],
  sections: [],
  options: []
}

const showsSectionLabel = (menu: SlashMenuState): boolean =>
  menu.tab === "all" || menu.sections.length > 1

const useHighlighted = (): CommandMenuItemData | undefined => {
  const { rows, highlight } = useCommandMenu()
  const index = useSyncExternalStore(
    highlight.subscribe,
    highlight.get,
    () => null
  )
  return index === null ? undefined : rows[index]
}

function SlashMenuKeys({
  editor,
  detachRef
}: Readonly<{
  editor: LexicalEditor
  detachRef: RefObject<boolean>
}>) {
  const { move, select, rows, highlight, listId } = useCommandMenu()
  const rowsRef = useRef(rows)
  useLayoutEffect(() => {
    rowsRef.current = rows
  }, [rows])

  useEffect(
    () =>
      mergeRegister(
        editor.registerCommand(
          KEY_ARROW_DOWN_COMMAND,
          (event) => {
            event.preventDefault()
            move(1)
            return true
          },
          COMMAND_PRIORITY_CRITICAL
        ),
        editor.registerCommand(
          KEY_ARROW_UP_COMMAND,
          (event) => {
            event.preventDefault()
            move(-1)
            return true
          },
          COMMAND_PRIORITY_CRITICAL
        ),
        editor.registerCommand(
          KEY_ENTER_COMMAND,
          (event) => {
            const index = highlight.get()
            const row = index === null ? undefined : rowsRef.current[index]
            if (row === undefined) return false
            event?.preventDefault()
            detachRef.current = event?.altKey === true
            select(row)
            return true
          },
          COMMAND_PRIORITY_CRITICAL
        )
      ),
    [detachRef, editor, highlight, move, select]
  )

  useEffect(() => {
    const point = () => {
      const index = highlight.get()
      const root = editor.getRootElement()
      if (index === null) root?.removeAttribute("aria-activedescendant")
      else root?.setAttribute("aria-activedescendant", `${listId}-${index}`)
    }
    point()
    return highlight.subscribe(point)
  }, [editor, highlight, listId])

  return null
}

function SlashMenuPreviewPane({
  items,
  library,
  lookup
}: Readonly<{
  items: ReadonlyMap<string, SlashItem>
  library: Library
  lookup: BlockLookup
}>) {
  const row = useHighlighted()
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
          lookup={lookup}
        />
      )}
    </div>
  )
}

function FooterHint({
  label,
  keys
}: Readonly<{ label: string; keys: string | ReadonlyArray<string> }>) {
  return (
    <span className="flex shrink-0 items-center gap-1.5">
      <span>{label}</span>
      <CommandMenuShortcut keys={keys} className="ml-0" />
    </span>
  )
}

function SlashMenuFooter({ tabs }: Readonly<{ tabs: boolean }>) {
  const row = useHighlighted()
  return (
    <CommandMenuFooter>
      <FooterHint
        label={m.editor_slash_footer_select()}
        keys={["up", "down"]}
      />
      {tabs ? (
        <FooterHint label={m.editor_slash_tabs_label()} keys="tab" />
      ) : null}
      {row === undefined ? null : (
        <span className="ml-auto flex min-w-0 items-center gap-1.5 text-foreground">
          <span className="truncate">{row.label}</span>
          <CommandMenuShortcut keys="enter" className="ml-0" />
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
        <span className="shrink-0 text-xs text-muted-foreground">{meta}</span>
      ) : null}
      {literal ? (
        <code className="shrink-0 font-mono text-[11px] text-muted-foreground/70">
          {literal}
        </code>
      ) : null}
      {shortcut ? (
        <span className="shrink-0 text-xs text-muted-foreground/70">
          {shortcut}
        </span>
      ) : null}
    </CommandMenuItem>
  )
}

function SlashMenuList({
  editor,
  menu,
  query,
  library,
  lookup,
  detachRef,
  onPick,
  onTab
}: Readonly<{
  editor: LexicalEditor
  menu: SlashMenuState
  query: string
  library: Library
  lookup: BlockLookup
  detachRef: RefObject<boolean>
  onPick: (key: string) => void
  onTab: (tab: SlashTab) => void
}>) {
  const frameRef = useRef<HTMLDivElement>(null)
  const menuRef = useRef<HTMLDivElement>(null)
  const layout = useSlashMenuLayout(
    frameRef,
    menuRef,
    editor.getRootElement(),
    query
  )
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
    (): ReadonlyArray<CommandMenuItemData> =>
      menu.sections.flatMap((section) =>
        section.items.map((item) => ({
          value: item.key,
          label: itemName(item),
          icon: itemIcon(item),
          group: SECTION_LABELS[section.section]()
        }))
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
    <div ref={frameRef} data-slash-menu-frame className="relative h-0 w-0">
      <div
        ref={menuRef}
        role="presentation"
        data-slash-menu-side={layout?.placement.side}
        style={
          layout === null
            ? { visibility: "hidden" }
            : {
                width: layout.fit.width,
                left: layout.left,
                top: layout.placement.top
              }
        }
        className={cn(
          "fixed top-0 left-0 z-50 flex w-[28rem] max-w-[calc(100vw-2rem)] flex-col overflow-hidden rounded-xl border border-border/60 bg-card text-foreground shadow-[0_4px_12px_rgba(0,0,0,0.02)] dark:shadow-[0_8px_32px_rgba(0,0,0,0.5)]",
          !hasTabs && "[&_.scroll-divider]:border-t-0"
        )}
      >
        <CommandMenu items={items} onSelect={(row) => onPick(row.value)}>
          <SlashMenuKeys editor={editor} detachRef={detachRef} />
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
              className="p-1"
            />
          ) : null}
          <div
            className="flex min-h-0"
            style={{ height: `${SLASH_MENU_BODY_REM}rem` }}
          >
            <div
              className={cn(
                "flex min-w-0 flex-col",
                layout?.fit.preview === true ? "w-[28rem] shrink-0" : "flex-1"
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
                <CommandMenuEmpty className="py-2 text-left text-[13px]">
                  {m.editor_slash_empty({ query })}
                </CommandMenuEmpty>
              </CommandMenuList>
            </div>
            {layout?.fit.preview === true ? (
              <SlashMenuPreviewPane
                items={itemsByKey}
                library={library}
                lookup={lookup}
              />
            ) : null}
          </div>
          <SlashMenuFooter tabs={hasTabs} />
        </CommandMenu>
      </div>
    </div>
  )
}

type SlashMenuLayout = Readonly<{
  fit: SlashMenuFit
  placement: SlashMenuPlacement
  left: number
}>

const sameLayout = (a: SlashMenuLayout | null, b: SlashMenuLayout): boolean =>
  a !== null &&
  a.fit.preview === b.fit.preview &&
  a.fit.width === b.fit.width &&
  a.left === b.left &&
  a.placement.side === b.placement.side &&
  a.placement.top === b.placement.top

type TriggerRect = Readonly<{ left: number; top: number; bottom: number }>

const triggerRect = (query: string, fallback: DOMRect): TriggerRect => {
  const selection = window.getSelection()
  if (selection === null || selection.rangeCount === 0)
    return { left: fallback.left, top: fallback.top, bottom: fallback.bottom }
  const caret = selection.getRangeAt(0)
  const trigger = caret.cloneRange()
  const node = caret.startContainer
  if (node.nodeType === Node.TEXT_NODE)
    trigger.setStart(node, Math.max(0, caret.startOffset - query.length - 1))
  const rect = trigger.getBoundingClientRect()
  if (rect.height > 0)
    return { left: rect.left, top: rect.top, bottom: rect.bottom }
  const line = caret.getBoundingClientRect()
  return line.height > 0
    ? { left: line.left, top: line.top, bottom: line.bottom }
    : { left: fallback.left, top: fallback.top, bottom: fallback.bottom }
}

function useSlashMenuLayout(
  frameRef: RefObject<HTMLDivElement | null>,
  menuRef: RefObject<HTMLDivElement | null>,
  root: HTMLElement | null,
  query: string
): SlashMenuLayout | null {
  const [layout, setLayout] = useState<SlashMenuLayout | null>(null)
  const measure = useCallback(() => {
    const frame = frameRef.current
    const menu = menuRef.current
    if (frame === null || menu === null) return
    const rem =
      Number.parseFloat(getComputedStyle(document.documentElement).fontSize) ||
      16
    const anchor = triggerRect(query, frame.getBoundingClientRect())
    const fit = fitSlashMenu({
      anchorLeft: anchor.left,
      bounds: slashMenuBounds(root),
      full: SLASH_MENU_FULL_REM * rem,
      list: SLASH_MENU_LIST_REM * rem
    })
    const placement = placeSlashMenu({
      caret: anchor,
      height: menu.offsetHeight,
      bounds: slashMenuSpan(root)
    })
    const next = { fit, placement, left: anchor.left + fit.offset }
    setLayout((previous) => (sameLayout(previous, next) ? previous : next))
  }, [frameRef, menuRef, root, query])

  useLayoutEffect(measure)

  useLayoutEffect(() => {
    window.addEventListener("resize", measure)
    document.addEventListener("scroll", measure, true)
    return () => {
      window.removeEventListener("resize", measure)
      document.removeEventListener("scroll", measure, true)
    }
  }, [measure])
  return layout
}

type RouteParams = Readonly<{ orgSlug?: string; slug?: string }>

function useOpenGallery() {
  const router: ReturnType<typeof useRouter> | undefined = useRouter({
    warn: false
  })
  return useCallback(
    (entry: "block" | "template") => {
      if (router === undefined) return
      const params: RouteParams = router.state.matches.at(-1)?.params ?? {}
      const search = entry === "block" ? { tab: "blocks" as const } : {}
      if (params.orgSlug === undefined) return
      if (params.slug === undefined)
        void router.navigate({
          to: "/orgs/$orgSlug/settings/templates",
          params: { orgSlug: params.orgSlug },
          search
        })
      else
        void router.navigate({
          to: "/orgs/$orgSlug/projects/$slug/settings/templates",
          params: { orgSlug: params.orgSlug, slug: params.slug },
          search
        })
    },
    [router]
  )
}

export function SlashMenuPlugin({
  library,
  ticketType,
  transformers,
  mode = "ticket"
}: Readonly<{
  library: Library
  ticketType: TicketType | null
  transformers: ReadonlyArray<Transformer>
  mode?: EditorBlocksMode
}>) {
  const [editor] = useLexicalComposerContext()
  const [query, setQuery] = useState<string | null>(null)
  const [tab, setTab] = useState<SlashTab>("all")
  const detachRef = useRef(false)
  const openGallery = useOpenGallery()
  const lookup = useMemo(() => lookupFor(library), [library])

  const menu = useMemo((): SlashMenuState => {
    if (query === null) return EMPTY_MENU
    const body = editor
      .getEditorState()
      .read(() => $convertToMarkdownString([...transformers]))
    const view = slashMenuView(
      { library, lookup, ticketType, body, query, basicLabel, mode },
      tab
    )
    return {
      tab: view.tab,
      tabs: view.tabs,
      sections: view.sections,
      options: view.sections.flatMap((section) =>
        section.items.map((item) => new SlashMenuOption(item))
      )
    }
  }, [editor, library, lookup, mode, tab, query, ticketType, transformers])

  const menuRef = useRef(menu)
  const openRef = useRef(false)
  useLayoutEffect(() => {
    menuRef.current = menu
    openRef.current = query !== null
  }, [menu, query])
  const switchTab = useCallback((next: SlashTab) => setTab(next), [])

  useEffect(
    () =>
      mergeRegister(
        editor.registerCommand(
          OPEN_SLASH_MENU_COMMAND,
          (section) => {
            setTab(section ?? "all")
            editor.focus(() => editor.update($typeSlashTrigger))
            return true
          },
          COMMAND_PRIORITY_EDITOR
        ),
        editor.registerCommand(
          KEY_TAB_COMMAND,
          (event) => {
            const tabs = menuRef.current.tabs.map((entry) => entry.tab)
            if (!openRef.current || tabs.length < 2) return false
            event.preventDefault()
            switchTab(
              cycleSlashTab(tabs, menuRef.current.tab, event.shiftKey ? -1 : 1)
            )
            return true
          },
          COMMAND_PRIORITY_CRITICAL
        )
      ),
    [editor, switchTab]
  )

  const onSelectOption = useCallback(
    (
      option: SlashMenuOption,
      nodeToReplace: TextNode | null,
      closeMenu: () => void
    ) => {
      const detach = detachRef.current
      detachRef.current = false
      const { item } = option
      if (item.kind === "gallery") {
        editor.update(() => {
          nodeToReplace?.remove()
          closeMenu()
        })
        openGallery(item.entry)
        return
      }
      editor.update(() => {
        nodeToReplace?.remove()
        $runSlashItem(editor, option.item, {
          transformers,
          lookup,
          detach,
          mode
        })
        closeMenu()
      })
    },
    [editor, lookup, mode, openGallery, transformers]
  )

  return (
    <LexicalTypeaheadMenuPlugin<SlashMenuOption>
      onQueryChange={setQuery}
      onClose={() => setTab("all")}
      onSelectOption={onSelectOption}
      triggerFn={slashTriggerMatch}
      options={menu.options}
      menuRenderFn={(anchorRef, itemProps, matchingString) =>
        anchorRef.current === null
          ? null
          : createPortal(
              <SlashMenuList
                editor={editor}
                menu={menu}
                library={library}
                lookup={lookup}
                detachRef={detachRef}
                onTab={switchTab}
                query={matchingString}
                onPick={(key) => {
                  const option = itemProps.options.find(
                    (candidate) => candidate.key === key
                  )
                  if (option !== undefined)
                    itemProps.selectOptionAndCleanUp(option)
                }}
              />,
              anchorRef.current
            )
      }
    />
  )
}
