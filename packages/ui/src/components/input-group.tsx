import * as React from "react"

import { fieldTouchClass } from "../lib/typeScale"
import { cn } from "../lib/utils"

function InputGroup({
  className,
  focused,
  onMouseDown,
  ...props
}: React.ComponentProps<"div"> & Readonly<{ focused?: boolean }>) {
  return (
    <div
      data-slot="input-group"
      data-focused={focused || undefined}
      onMouseDown={(e) => {
        onMouseDown?.(e)
        if (e.defaultPrevented) return
        const target = e.target
        if (
          target instanceof Element &&
          target.closest(
            "button, [role='button'], a, input, textarea, select, [contenteditable='true']"
          )
        ) {
          return
        }
        const input = e.currentTarget.querySelector<HTMLInputElement>(
          "[data-slot='input-group-input']"
        )
        if (!input) return
        e.preventDefault()
        if (input !== document.activeElement) input.focus()
      }}
      className={cn(
        "group/input-group relative flex h-9 w-full min-w-0 cursor-text items-center gap-2 rounded-[18px] border border-(--segment-line) bg-field px-3 transition-[color,box-shadow] [corner-shape:var(--button-corner)] has-[>[data-slot=input-group-control]:last-child]:pr-[5px] has-[>[data-slot=kbd]:last-child]:pr-[7px]",
        // A leading icon sits optically close to the edge, like Button's
        // icon side: about 10px to the glyph against 13px on the text side.
        "has-[>[data-slot=input-group-addon]:first-child]:pl-1",
        // The shortcut key is inset 8px on every side (7px + the border), so
        // its corners are the field's minus 8 (18 - 8 = 10) in the same
        // shape: concentric. No outline: a soft glow along its bottom inside
        // edge (--kbd-glow) gives it a little depth, like a key catching light.
        "[&>[data-slot=kbd]]:rounded-[10px] [&>[data-slot=kbd]]:shadow-[inset_0_-1px_2px_var(--kbd-glow)] [&>[data-slot=kbd]]:[corner-shape:var(--button-corner)]",
        // The shared focus ring (theme.css .focus-ring), drawn on the group.
        focused === undefined
          ? "focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-ring"
          : "data-focused:outline-2 data-focused:outline-offset-2 data-focused:outline-ring",
        "has-[input:disabled]:opacity-50",
        className
      )}
      {...props}
    />
  )
}

function InputGroupInput({
  className,
  ...props
}: React.ComponentProps<"input">) {
  return (
    <input
      data-slot="input-group-input"
      className={cn(
        "min-w-0 flex-1 bg-transparent text-foreground outline-none placeholder:text-muted-foreground disabled:cursor-not-allowed",
        "text-body",
        fieldTouchClass,
        className
      )}
      {...props}
    />
  )
}

function InputGroupAddon({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="input-group-addon"
      className={cn(
        "grid size-6 shrink-0 place-items-center text-muted-foreground transition-colors",
        className
      )}
      {...props}
    />
  )
}

function InputGroupHint({ className, ...props }: React.ComponentProps<"span">) {
  return (
    <span
      data-slot="input-group-hint"
      className={cn(
        "shrink-0 text-muted-foreground",
        "text-caption",
        className
      )}
      {...props}
    />
  )
}

export { InputGroup, InputGroupAddon, InputGroupInput, InputGroupHint }
