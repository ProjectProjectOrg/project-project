import * as React from "react"

import { fieldTouchClass } from "../lib/typeScale"
import { cn } from "../lib/utils"

// default: the bordered field. bare: no fill or border at rest, for fields
// inside a composer that styles its own text; it still shows a hover tint and
// a lighter tint while focused, so you can see what is editable and where you
// are typing.
type InputVariant = "default" | "bare"
// The same heights as Button, so a field and a button sit level in a row.
type InputSize = "sm" | "md" | "lg"

// The bare field's tint: none at rest, --field-hover on hover, and the lighter
// --field-focus while focused. Exported for app fields that edit text in
// place (a ticket title, a sprint name) so they read like a bare Input.
const bareFieldTintClass =
  "rounded-[10px] transition-colors duration-150 [corner-shape:var(--button-corner)] not-disabled:hover:bg-(--field-hover) not-disabled:hover:duration-0 focus-visible:bg-(--field-focus) focus-within:bg-(--field-focus)"

// The bare Input: the tint plus 8px of padding, cancelled by equal negative
// margins, so the text sits exactly where an unpadded field's would and
// nothing around it moves.
const bareFieldClass = `-mx-2 -my-1 w-[calc(100%+1rem)] bg-transparent px-2 py-1 ${bareFieldTintClass}`

const INPUT_VARIANT: Record<InputVariant, string> = {
  default:
    "border border-(--segment-line) bg-field focus-ring aria-invalid:border-destructive",
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

export { Input, bareFieldClass, bareFieldTintClass }
export type { InputSize, InputVariant }
