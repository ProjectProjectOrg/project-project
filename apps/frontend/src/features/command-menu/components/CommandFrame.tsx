import { ChevronRight, Search } from "lucide-react"
import { useEffect, useRef, useState, type ReactNode } from "react"

import {
  CommandMenu,
  CommandMenuEmpty,
  CommandMenuInput,
  CommandMenuItem,
  CommandMenuList,
  type CommandMenuItemData
} from "@/components/ui/command-menu"
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle
} from "@/components/ui/empty"
import type { IconComponent } from "@/lib/icon"
import { m } from "@/paraglide/messages"

export type CommandFrameItem = CommandMenuItemData &
  Readonly<{
    keywords?: ReadonlyArray<string>
    parent?: string
    prefix?: string
    searchOnly?: boolean
    prefiltered?: boolean
  }>

export const matches = (item: CommandFrameItem, query: string): boolean => {
  const words = query.toLowerCase().split(/\s+/).filter(Boolean)
  const haystack = [
    item.parent ?? "",
    item.prefix ?? "",
    item.label,
    ...(item.keywords ?? [])
  ]
    .join(" ")
    .toLowerCase()
  return words.every((word) => haystack.includes(word))
}

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
}>

export type CommandEmpty = Readonly<{
  icon: IconComponent
  title: string
  description: string
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
  notice = null
}: CommandFrameProps) {
  const [search, setSearch] = useState("")
  const [heldHeight, setHeldHeight] = useState<number | null>(null)
  const frame = useRef<HTMLDivElement>(null)
  const input = useRef<HTMLInputElement>(null)
  useEffect(() => input.current?.focus(), [])
  const query = search.trim()
  const visible =
    query === ""
      ? items.filter((item) => item.searchOnly !== true)
      : filter
        ? items.filter(
            (item) => item.prefiltered === true || matches(item, query)
          )
        : items
  const decorations = new Map(
    visible.map((item) => [item.value, item] as const)
  )

  return (
    <CommandMenu
      ref={frame}
      style={heldHeight === null ? undefined : { minHeight: heldHeight }}
      stretch
      className="flex min-h-0 flex-1 flex-col"
      items={visible}
      onSelect={onSelect}
    >
      <div className="flex flex-col gap-1 border-b border-border/60 px-1 pt-2 pb-1">
        {chip !== null && <div className="px-2">{chip}</div>}
        <CommandMenuInput
          ref={input}
          placeholder={placeholder}
          value={search}
          onChange={(event) => {
            const next = event.target.value
            if (next.trim() === "") setHeldHeight(null)
            else if (heldHeight === null) {
              setHeldHeight(frame.current?.offsetHeight ?? null)
            }
            setSearch(next)
            onSearchChange?.(event.target.value)
          }}
          onKeyDown={(event) => {
            if (event.key === "Backspace" && search === "") {
              event.preventDefault()
              onBack()
            }
          }}
        />
      </div>
      <CommandMenuList
        className="min-h-0 flex-1 p-1.5"
        renderItem={(item) => {
          if (renderItem) return renderItem(item)
          const { prefix, parent } = decorations.get(item.value) ?? {}
          return (
            <CommandMenuItem value={item.value}>
              {prefix !== undefined && (
                <span className="shrink-0 font-mono text-xs text-muted-foreground tabular-nums">
                  {prefix}
                </span>
              )}
              {parent !== undefined && (
                <>
                  <span className="shrink-0 text-muted-foreground">
                    {parent}
                  </span>
                  <ChevronRight
                    className="size-3.5 shrink-0 text-muted-foreground"
                    strokeWidth={1.75}
                  />
                </>
              )}
              <span className="min-w-0 flex-1 truncate">{item.label}</span>
            </CommandMenuItem>
          )
        }}
      >
        <CommandMenuEmpty className="p-0">
          <CommandFrameEmpty
            {...(empty ?? {
              icon: Search,
              title: m.chrome_command_menu_empty_title({ query }),
              description: m.chrome_command_menu_empty_description()
            })}
          />
        </CommandMenuEmpty>
      </CommandMenuList>
      {notice !== null && (
        <p
          role="alert"
          className="mx-2 mb-2 rounded-lg bg-destructive-light px-3 py-2 text-[13px] text-destructive"
        >
          {notice}
        </p>
      )}
    </CommandMenu>
  )
}

function CommandFrameEmpty({ icon: Icon, title, description }: CommandEmpty) {
  return (
    <Empty variant="compact">
      <EmptyHeader>
        <EmptyMedia variant="icon">
          <Icon strokeWidth={1.75} />
        </EmptyMedia>
        <EmptyTitle>{title}</EmptyTitle>
        <EmptyDescription>{description}</EmptyDescription>
      </EmptyHeader>
    </Empty>
  )
}
