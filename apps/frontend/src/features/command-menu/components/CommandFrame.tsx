import type { TextRange } from "@pp/shared"
import { Search } from "lucide-react"
import { motion } from "motion/react"
import { useEffect, useId, useRef, useState, type ReactNode } from "react"

import { Button } from "@/components/ui/button"
import {
  CommandMenu,
  CommandMenuEmpty,
  CommandMenuInput,
  CommandMenuList,
  type CommandMenuItemData
} from "@/components/ui/command-menu"
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle
} from "@/components/ui/empty"
import { scoreSearch } from "@/features/command-menu/lib/searchScore"
import type { IconComponent } from "@/lib/icon"
import { cn } from "@/lib/utils"
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
    parent?: string
    prefix?: string
    searchOnly?: boolean
    prefiltered?: boolean
    rank?: number
    actionable?: boolean
    peekable?: boolean
    enterLabel?: string
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

const keyWidth = (items: ReadonlyArray<CommandFrameItem>) =>
  `${Math.max(0, ...items.map((item) => item.prefix?.length ?? 0))}ch`

export type CommandFrameProps = Readonly<{
  chip: ReactNode
  placeholder: string
  items: ReadonlyArray<CommandFrameItem>
  onSelect: (item: CommandMenuItemData) => void
  onBack: () => void
  renderItem?: (item: CommandMenuItemData) => ReactNode
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
  fixedHeight = false
}: CommandFrameProps) {
  const peek = usePeekWipe()
  const highlighted = useRef<CommandMenuItemData | undefined>(undefined)
  const [search, setSearch] = useState(initialSearch)
  const input = useRef<HTMLInputElement>(null)
  const backHint = useId()
  useEffect(() => input.current?.focus(), [])
  const query = search.trim()
  const visible =
    query === ""
      ? items.filter((item) => item.searchOnly !== true)
      : filter
        ? rankItems(items, query)
        : items
  const decorations = new Map(
    visible.map((item) => [item.value, item] as const)
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
      <div className="flex flex-col gap-1 border-b border-border/60 px-1 pt-2 pb-1">
        {chip !== null && <div className="px-2">{chip}</div>}
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
            "relative z-10 flex min-h-0 min-w-0 shrink-0 flex-col bg-popover",
            peek.mounted && "border-r border-border/60"
          )}
        >
          <CommandMenuList
            className="min-h-0 flex-1 p-1.5"
            renderItem={(item) => {
              if (renderItem) return renderItem(item)
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
      {searchFooter && query !== "" && (
        <SearchFooter decorations={decorations} peekOpen={peek.active} />
      )}
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
    <Empty variant="compact">
      <EmptyHeader>
        <EmptyMedia variant="icon">
          <Icon strokeWidth={1.75} />
        </EmptyMedia>
        <EmptyTitle>{title}</EmptyTitle>
        <EmptyDescription>{description}</EmptyDescription>
      </EmptyHeader>
      {action !== undefined && (
        <EmptyContent className="mt-3">
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
