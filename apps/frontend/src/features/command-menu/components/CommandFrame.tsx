import type { TextRange } from "@pp/shared"
import { Button } from "@pp/ui/button"
import {
  CommandMenu,
  CommandMenuEmpty,
  CommandMenuInput,
  CommandMenuList,
  type CommandMenuItemData
} from "@pp/ui/command-menu"
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle
} from "@pp/ui/empty"
import { Search } from "@pp/ui/icons"
import { numberKey } from "@pp/ui/kbd"
import type { IconComponent } from "@pp/ui/lib/icon"
import { cn } from "@pp/ui/lib/utils"
import type { Hotkey, HotkeyChord } from "@tanstack/react-hotkeys"
import { motion } from "motion/react"
import { useEffect, useId, useRef, useState, type ReactNode } from "react"

import { scoreSearch } from "@/features/command-menu/lib/searchScore"
import { m } from "@/paraglide/messages"

import { SearchFooter } from "./CommandFrameFooter"
import { CommandFrameRow } from "./CommandFrameRow"
import {
  CommandPeekPane,
  PeekWarmer,
  peekFits,
  TrackHighlight,
  usePeekWipe
} from "./CommandPeek"

export type CommandFrameItem = CommandMenuItemData &
  Readonly<{
    keywords?: ReadonlyArray<string>
    parent?: ReadonlyArray<string>
    prefix?: string
    aside?: ReactNode
    searchOnly?: boolean
    prefiltered?: boolean
    rank?: number
    actionable?: boolean
    peekable?: boolean
    enterLabel?: string
    shortcut?: Hotkey
    detail?: Readonly<{
      author?: string
      text: string
      ranges: ReadonlyArray<TextRange>
    }>
  }>

const STRONG_MATCH = 55

const GROUP_BONUS = 5

const groupBonus = (group: string | undefined, query: string) =>
  group?.toLowerCase().startsWith(query.trim().toLowerCase()) === true
    ? GROUP_BONUS
    : 0

const rankItems = (items: ReadonlyArray<CommandFrameItem>, query: string) => {
  const ranked = items.flatMap((item, index) => {
    if (item.prefiltered === true) {
      return item.rank === undefined ? [] : [{ item, index, score: item.rank }]
    }
    const score = scoreSearch(item, query)
    return score === null
      ? []
      : [{ item, index, score: score + groupBonus(item.group, query) }]
  })
  const sorted = ranked.toSorted(
    (a, b) => b.score - a.score || a.index - b.index
  )
  const results = sorted.filter(({ item }) => item.prefiltered === true)
  const commands = sorted.filter(({ item }) => item.prefiltered !== true)
  const topResult = results[0]?.score ?? Number.NEGATIVE_INFINITY
  const lead = commands.filter(
    ({ score }) => score >= STRONG_MATCH && score > topResult
  )
  return [
    ...lead,
    ...results,
    ...commands.filter((entry) => !lead.includes(entry))
  ]
    .map(({ item }) => item)
    .concat(
      items.filter(
        (item) => item.prefiltered === true && item.rank === undefined
      )
    )
}

// The rows a query shows, each row's item by value, and (unsearched, on a
// numbered page) the number key that picks it.
const frameRows = (
  items: ReadonlyArray<CommandFrameItem>,
  query: string,
  filter: boolean,
  numbered: boolean
) => {
  const visible =
    query === ""
      ? items.filter((item) => item.searchOnly !== true)
      : filter
        ? rankItems(items, query)
        : items
  return {
    visible,
    decorations: new Map(visible.map((item) => [item.value, item] as const)),
    numbers: new Map(
      numbered && query === ""
        ? visible.flatMap((item, index) => {
            const number = numberKey(index)
            return number === undefined ? [] : [[item.value, number] as const]
          })
        : []
    )
  }
}

const keyWidth = (items: ReadonlyArray<CommandFrameItem>) =>
  `${Math.max(0, ...items.map((item) => item.prefix?.length ?? 0))}ch`

export type CommandFrameProps = Readonly<{
  chip: ReactNode
  placeholder: string
  items: ReadonlyArray<CommandFrameItem>
  onSelect: (item: CommandMenuItemData) => void
  onBack: () => void
  renderItem?: (
    item: CommandMenuItemData,
    number: HotkeyChord | undefined
  ) => ReactNode
  numbered?: boolean
  onSearchChange?: (search: string) => void
  filter?: boolean
  empty?: CommandEmpty
  notice?: string | null
  description?: string
  initialSearch?: string
  initialFocus?: string | null
  searchFooter?: boolean
  onActOn?: (item: CommandMenuItemData) => boolean
  renderPeek?: (value: string) => ReactNode
  warmPeek?: (value: string) => ReactNode
  fixedHeight?: boolean
  // Below the list, in place of the search footer: a staged change's
  // preview and its Apply.
  footer?: ReactNode
  // Mod+Enter: applies what the page has staged.
  onSubmit?: () => void
}>

export type CommandEmpty = Readonly<{
  icon: IconComponent
  title: string
  description: string
  action?: Readonly<{ label: string; icon: IconComponent; run: () => void }>
}>

export function CommandFrame({
  chip,
  placeholder,
  items,
  onSelect,
  onBack,
  renderItem,
  numbered = false,
  onSearchChange,
  filter = true,
  empty,
  notice = null,
  description,
  initialSearch = "",
  initialFocus = null,
  searchFooter = false,
  onActOn,
  renderPeek,
  warmPeek,
  fixedHeight = false,
  footer,
  onSubmit
}: CommandFrameProps) {
  const peek = usePeekWipe()
  const highlighted = useRef<CommandMenuItemData | undefined>(undefined)
  const [search, setSearch] = useState(initialSearch)
  const input = useRef<HTMLInputElement>(null)
  const backHint = useId()
  useEffect(() => input.current?.focus(), [])
  const query = search.trim()
  const { visible, decorations, numbers } = frameRows(
    items,
    query,
    filter,
    numbered
  )

  return (
    <CommandMenu
      style={{ "--row-key-width": keyWidth(visible) }}
      stretch
      className={cn(
        "flex min-h-0 flex-col [&_.scroll-divider]:border-t-0",
        fixedHeight ? "h-[min(440px,76dvh)] flex-none" : "flex-1"
      )}
      items={visible}
      resetKey={query}
      onSelect={onSelect}
      onActOn={onActOn}
      initialValue={initialFocus}
    >
      <div className="flex flex-col border-b border-border/60 has-[[data-slot=command-frame-chip]]:pt-2">
        {chip !== null && (
          <div data-slot="command-frame-chip" className="px-3.5">
            {chip}
          </div>
        )}
        <span id={backHint} className="sr-only">
          {m.chrome_command_menu_back_hint()}
        </span>
        <CommandMenuInput
          ref={input}
          aria-describedby={backHint}
          placeholder={placeholder}
          readOnly={description !== undefined}
          value={description ?? search}
          className={
            description === undefined
              ? undefined
              : "cursor-default text-muted-foreground caret-transparent"
          }
          onChange={(event) => {
            const next = event.target.value
            setSearch(next)
            onSearchChange?.(event.target.value)
          }}
          onKeyDown={(event) => {
            if (
              peek.active &&
              (event.key === "ArrowLeft" || event.key === "Escape")
            ) {
              event.preventDefault()
              event.stopPropagation()
              peek.close()
              return
            }
            const input = event.currentTarget
            if (
              event.key === "ArrowRight" &&
              renderPeek !== undefined &&
              input.selectionStart === input.value.length &&
              decorations.get(highlighted.current?.value ?? "")?.peekable ===
                true &&
              peekFits()
            ) {
              event.preventDefault()
              peek.open()
              return
            }
            const picked = numbered && search === "" ? event.key : null
            const pickedItem = visible.find(
              (item) => numbers.get(item.value) === picked
            )
            if (
              pickedItem !== undefined &&
              !event.metaKey &&
              !event.ctrlKey &&
              !event.altKey
            ) {
              event.preventDefault()
              onSelect(pickedItem)
              return
            }
            if (
              onSubmit !== undefined &&
              event.key === "Enter" &&
              (event.metaKey || event.ctrlKey)
            ) {
              event.preventDefault()
              onSubmit()
              return
            }
            if (event.key === "Backspace" && search === "") {
              event.preventDefault()
              onBack()
              return
            }
            if (
              event.key === "Enter" &&
              visible.length === 0 &&
              empty?.action !== undefined
            ) {
              event.preventDefault()
              empty.action.run()
            }
          }}
        />
      </div>
      <TrackHighlight
        onChange={(row) => {
          highlighted.current = row
        }}
      />
      <div className="relative flex min-h-0 flex-1">
        {renderPeek !== undefined && peek.mounted && (
          <CommandPeekPane open={peek.active} render={renderPeek} />
        )}
        {warmPeek !== undefined && !peek.mounted && (
          <PeekWarmer warm={warmPeek} />
        )}
        <motion.div
          style={peek.style}
          className={cn(
            "relative z-10 flex min-h-0 min-w-0 shrink-0 flex-col bg-(color:--tooltip)",
            peek.mounted && "border-r border-(--segment-line)"
          )}
        >
          <CommandMenuList
            className="min-h-0 flex-1"
            renderItem={(item) => {
              if (renderItem) return renderItem(item, numbers.get(item.value))
              const decoration = decorations.get(item.value)
              return decoration === undefined ? null : (
                <CommandFrameRow item={decoration} />
              )
            }}
          >
            <CommandMenuEmpty className="p-0">
              <CommandFrameEmpty
                {...(empty ?? {
                  icon: Search,
                  title:
                    query === ""
                      ? m.chrome_command_menu_empty_list()
                      : m.chrome_command_menu_empty_title({ query }),
                  description:
                    query === ""
                      ? ""
                      : m.chrome_command_menu_empty_description()
                })}
              />
            </CommandMenuEmpty>
          </CommandMenuList>
        </motion.div>
      </div>
      {footer ??
        (searchFooter && query !== "" && (
          <SearchFooter decorations={decorations} peekOpen={peek.active} />
        ))}
      {notice !== null && (
        <p
          role="alert"
          className="mx-2 mb-2 rounded-lg bg-destructive-light px-3 py-2 text-body text-destructive"
        >
          {notice}
        </p>
      )}
    </CommandMenu>
  )
}

function CommandFrameEmpty({
  icon: Icon,
  title,
  description,
  action
}: CommandEmpty) {
  return (
    <Empty intensity="subtle" animated={false} className="m-1.5 min-h-56">
      <EmptyHeader>
        <EmptyMedia variant="icon">
          <Icon strokeWidth={1.75} />
        </EmptyMedia>
        <EmptyTitle>{title}</EmptyTitle>
        <EmptyDescription>{description}</EmptyDescription>
      </EmptyHeader>
      {action !== undefined && (
        <EmptyContent>
          <Button
            type="button"
            variant="tertiary"
            size="sm"
            leadingIcon={action.icon}
            onClick={action.run}
          >
            {action.label}
          </Button>
        </EmptyContent>
      )}
    </Empty>
  )
}
