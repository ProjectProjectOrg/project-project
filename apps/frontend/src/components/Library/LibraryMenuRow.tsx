import type { ReactNode, Ref } from "react"

import { cn } from "@/lib/utils"

export type LibraryMenuRowProps = Readonly<{
  id?: string
  ref?: Ref<HTMLButtonElement>
  icon: ReactNode
  name: string
  meta?: string | null
  shortcut?: string | null
  literal?: string | null
  size?: "default" | "large"
  highlighted: boolean
  onSelect: (alt: boolean) => void
  onHighlight: () => void
}>

export function LibraryMenuRow({
  id,
  ref,
  icon,
  name,
  meta,
  shortcut,
  literal,
  size = "default",
  highlighted,
  onSelect,
  onHighlight
}: LibraryMenuRowProps) {
  return (
    <button
      id={id}
      ref={ref}
      type="button"
      role="option"
      tabIndex={-1}
      aria-selected={highlighted}
      data-highlighted={highlighted ? "" : undefined}
      onMouseDown={(event) => {
        event.preventDefault()
        onSelect(event.altKey)
      }}
      onMouseEnter={onHighlight}
      className={cn(
        "relative flex w-full items-center gap-2 rounded-md px-2 text-left outline-none",
        size === "large" ? "h-9" : "h-8"
      )}
    >
      {icon}
      <span className="min-w-0 flex-1 truncate text-[13px] text-foreground">
        {name}
      </span>
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
    </button>
  )
}
