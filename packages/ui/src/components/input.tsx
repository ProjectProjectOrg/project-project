import * as React from "react"

import { fieldTouchClass } from "../lib/typeScale"
import { cn } from "../lib/utils"

// default: the bordered field, tinted on hover and, lighter, while focused.
// bare: text only, for fields inside a composer that styles its own text; no
// fill or line in any state, its placeholder steps up on hover and focus.
type InputVariant = "default" | "bare"
// The same heights as Button, so a field and a button sit level in a row.
type InputSize = "sm" | "md" | "lg"

// The bare field's states, on its placeholder only: --muted-foreground at
// rest, --placeholder-hover on hover and --placeholder-focus while focused,
// all in the placeholder range. Covers a native placeholder and the editor's
// (data-slot="editor-placeholder"). Exported for app fields that edit text in
// place (a ticket title, a sprint name) so they read like a bare Input.
const bareFieldStateClass = cn(
  "cursor-text placeholder:transition-colors placeholder:duration-150 [&_[data-slot=editor-placeholder]]:transition-colors [&_[data-slot=editor-placeholder]]:duration-150",
  "not-disabled:not-focus-within:hover:placeholder:text-(--placeholder-hover) not-disabled:not-focus-within:hover:placeholder:duration-0 not-focus-within:hover:[&_[data-slot=editor-placeholder]]:text-(--placeholder-hover) not-focus-within:hover:[&_[data-slot=editor-placeholder]]:duration-0",
  "focus-within:placeholder:text-(--placeholder-focus) focus:placeholder:text-(--placeholder-focus) focus-within:[&_[data-slot=editor-placeholder]]:text-(--placeholder-focus)",
  "[&_::placeholder]:transition-colors [&_::placeholder]:duration-150 focus-within:[&_::placeholder]:text-(--placeholder-focus) not-focus-within:hover:[&_::placeholder]:text-(--placeholder-hover) not-focus-within:hover:[&_::placeholder]:duration-0"
)

// The bordered field gets the same two tints, laid over its --field fill as
// an inset shadow (a background colour would replace the fill, and a
// gradient can't fade out).
const fieldTintClass =
  "transition-[box-shadow] duration-150 not-disabled:hover:shadow-[inset_0_0_0_100vmax_var(--field-hover)] not-disabled:hover:duration-0 focus-visible:shadow-[inset_0_0_0_100vmax_var(--field-focus)]"

// The bare Input: the states plus 8px of padding, cancelled by equal negative
// margins, so the click area reaches past the text and nothing around it
// moves.
const bareFieldClass = `-mx-2 -my-1 w-[calc(100%+1rem)] bg-transparent px-2 py-1 ${bareFieldStateClass}`

const INPUT_VARIANT: Record<InputVariant, string> = {
  default: `border border-(--field-line) bg-field focus-ring aria-invalid:border-destructive ${fieldTintClass}`,
  bare: bareFieldClass
}

// Corners at half the height, shaped like Button's (--button-corner).
const INPUT_SIZE: Record<InputSize, string> = {
  sm: "h-7 rounded-[14px] px-2.5 text-caption [corner-shape:var(--button-corner)]",
  md: "h-8 rounded-[16px] px-3 [corner-shape:var(--button-corner)]",
  lg: "h-9 rounded-[18px] px-3 py-1.5 [corner-shape:var(--button-corner)]"
}

function Input({
  className,
  type,
  variant = "default",
  size = "lg",
  ...props
}: Omit<React.ComponentProps<"input">, "size"> &
  Readonly<{ variant?: InputVariant; size?: InputSize }>) {
  return (
    <input
      type={type}
      data-slot="input"
      className={cn(
        "w-full min-w-0 outline-none selection:bg-primary selection:text-primary-foreground file:inline-flex file:h-7 file:border-0 file:bg-transparent file:text-foreground placeholder:text-muted-foreground disabled:cursor-not-allowed disabled:opacity-50",
        "text-body",
        fieldTouchClass,
        INPUT_VARIANT[variant],
        variant === "default" && INPUT_SIZE[size],
        className
      )}
      {...props}
    />
  )
}

export { Input, bareFieldClass, bareFieldStateClass, fieldTintClass }
export type { InputSize, InputVariant }
