import type { TextRange } from "@pp/shared"
import { ChevronRight } from "lucide-react"

import { CommandMenuItem } from "@/components/ui/command-menu"
import { cn } from "@/lib/utils"

import type { CommandFrameItem } from "./CommandFrame"

export function CommandFrameRow({
  item
}: Readonly<{ item: CommandFrameItem }>) {
  const { prefix, parent, aside, detail } = item
  if (detail !== undefined) {
    return (
      <CommandMenuItem
        value={item.value}
        className="grid h-auto grid-cols-[auto_minmax(0,1fr)] items-baseline gap-x-2 gap-y-0.5 py-2"
      >
        <span className="min-w-(--row-key-width) font-mono text-caption text-muted-foreground tabular-nums">
          {prefix}
        </span>
        <span className="truncate">{item.label}</span>
        <span className="col-start-2 truncate text-caption text-muted-foreground">
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
      <span className="flex min-w-0 flex-1 items-center gap-1">
        {prefix !== undefined && (
          <span className="flex min-w-0 flex-1 items-baseline gap-2">
            <span className="min-w-(--row-key-width) shrink-0 font-mono text-caption text-muted-foreground tabular-nums">
              {prefix}
            </span>
            <span className="min-w-0 truncate">{item.label}</span>
          </span>
        )}
        {parent !== undefined && (
          <>
            <span className="shrink-0 text-muted-foreground">{parent}</span>
            <ChevronRight
              className="size-3.5 shrink-0 text-muted-foreground"
              strokeWidth={1.75}
            />
          </>
        )}
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
