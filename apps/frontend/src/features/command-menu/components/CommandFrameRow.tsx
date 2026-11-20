import type { TextRange } from "@pp/shared"
import { CommandMenuItem, CommandMenuShortcut } from "@pp/ui/command-menu"
import { ChevronRight } from "@pp/ui/icons"
import { cn } from "@pp/ui/lib/utils"

import { keyLabels } from "@/lib/keyLabels"

import type { CommandFrameItem } from "./CommandFrame"

export function CommandFrameRow({
  item
}: Readonly<{ item: CommandFrameItem }>) {
  const { prefix, parent, leading, aside, detail, shortcut } = item
  if (detail !== undefined) {
    return (
      <CommandMenuItem
        value={item.value}
        layout="detail"
        className={cn(
          leading == null
            ? "grid-cols-[auto_minmax(0,1fr)]"
            : "grid-cols-[auto_auto_minmax(0,1fr)]"
        )}
      >
        {leading != null && (
          <span className="flex h-lh items-center self-start">{leading}</span>
        )}
        <span className="min-w-(--row-key-width) text-caption text-muted-foreground tabular-nums">
          {prefix}
        </span>
        <span className="truncate">{item.label}</span>
        <span
          className={cn(
            "truncate text-caption text-muted-foreground",
            leading == null ? "col-start-2" : "col-start-3"
          )}
        >
          {detail.author !== undefined && (
            <span className="text-muted-foreground">{detail.author} </span>
          )}
          <Highlighted text={detail.text} ranges={detail.ranges} />
        </span>
      </CommandMenuItem>
    )
  }
  return (
    <CommandMenuItem value={item.value}>
      {leading}
      <span className="flex min-w-0 flex-1 items-center gap-1">
        {prefix !== undefined && (
          <span className="flex min-w-0 flex-1 items-baseline gap-2">
            <span className="min-w-(--row-key-width) shrink-0 text-caption text-muted-foreground tabular-nums">
              {prefix}
            </span>
            <span className="min-w-0 truncate">{item.label}</span>
          </span>
        )}
        {parent?.map((part, index) => (
          <span key={index} className="flex shrink-0 items-center gap-1">
            <span className="text-muted-foreground">{part}</span>
            <ChevronRight
              className="size-3.5 shrink-0 text-muted-foreground"
              strokeWidth={1.75}
            />
          </span>
        ))}
        {prefix === undefined && (
          <span className={cn("min-w-0 truncate", aside == null && "flex-1")}>
            {item.label}
          </span>
        )}
        {aside != null && (
          <span className="ml-1 flex min-w-0 group-aria-selected/command-item:[&_.text-muted-foreground]:text-foreground">
            {aside}
          </span>
        )}
        {shortcut !== undefined && (
          <CommandMenuShortcut
            keyLabels={keyLabels()}
            keys={shortcut}
            aria-hidden
            className="ml-2"
          />
        )}
      </span>
    </CommandMenuItem>
  )
}

function Highlighted({
  text,
  ranges
}: Readonly<{ text: string; ranges: ReadonlyArray<TextRange> }>) {
  if (ranges.length === 0) return text
  const parts = ranges.flatMap(([start, end], index) => [
    text.slice(ranges[index - 1]?.[1] ?? 0, start),
    <mark
      key={start}
      className="bg-transparent text-foreground underline decoration-foreground/40 underline-offset-2"
    >
      {text.slice(start, end)}
    </mark>
  ])
  return [...parts, text.slice(ranges.at(-1)?.[1] ?? 0)]
}
