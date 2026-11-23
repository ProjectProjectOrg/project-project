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
        "group/input-group relative flex h-9 w-full min-w-0 cursor-text items-center gap-2 rounded-[18px] border border-(--field-line) bg-field px-3 transition-[color,box-shadow] [corner-shape:var(--button-corner)] has-[>[data-slot=input-group-control]:last-child]:pr-[5px] has-[>[data-slot=kbd]:last-child]:pr-[7px]",
        // A leading icon sits optically close to the edge, like Button's
        // icon side: about 10px to the glyph against 13px on the text side.
        "has-[>[data-slot=input-group-addon]:first-child]:pl-1",
        // A trailing shortcut key (Kbd) is inset 8px on every side (7px + the
        // border), so its 10px corners are the field's 18 minus 8: concentric.
        // The shared focus ring (theme.css .focus-ring), drawn on the group.
        focused === undefined
          ? "focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-ring"
          : "data-focused:outline-2 data-focused:outline-offset-2 data-focused:outline-ring",
        "has-[input:disabled]:opacity-50",
        // The same hover and focus tints as Input, over the field fill.
        "duration-150 [--field-fill:var(--field)] not-has-[input:disabled]:hover:shadow-[inset_0_0_0_100vmax_var(--field-hover)] not-has-[input:disabled]:hover:duration-0 not-has-[input:disabled]:hover:[--field-fill:var(--field-hover)]",
        focused === undefined
          ? "focus-within:shadow-[inset_0_0_0_100vmax_var(--field-focus)] focus-within:[--field-fill:var(--field-focus)]"
          : "data-focused:shadow-[inset_0_0_0_100vmax_var(--field-focus)] data-focused:[--field-fill:var(--field-focus)]",
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
