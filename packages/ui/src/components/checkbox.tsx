import { Checkbox as CheckboxPrimitive } from "@base-ui/react/checkbox"
import type * as React from "react"

import { cn } from "../lib/utils"

const variants = {
  default:
    "size-4 [--cb-r:4.5px] supports-[corner-shape:squircle]:[--cb-r:6.5px] shadow-[inset_0_0_0_1.5px_var(--checkbox-ring)]",
  // The list row's checkbox: a 16px box in a 24px target, so it meets the
  // target size without a pseudo-element hit area. The box is drawn by the
  // inner span (quietBoxClass).
  quiet:
    "size-6 rounded-[9px] [--cb-r:4.5px] supports-[corner-shape:squircle]:[--cb-r:6.5px]"
}

const quietBoxClass =
  "relative grid size-4 place-items-center rounded-(--cb-r) shadow-[inset_0_0_0_1.5px_var(--checkbox-ring-quiet)] transition-[box-shadow] duration-150 ease-standard corner-squircle group-[:hover:not([data-disabled],[data-readonly])]/checkbox:shadow-[inset_0_0_0_1.5px_var(--checkbox-ring-hover)] group-[:hover:not([data-disabled],[data-readonly])]/checkbox:duration-[0ms]"

const interactive =
  "[&:not([data-disabled],[data-readonly])]:hover:shadow-[inset_0_0_0_1.5px_var(--checkbox-ring-hover)] [&:not([data-disabled],[data-readonly])]:hover:duration-[0ms,120ms] [&:not([data-disabled],[data-readonly])]:active:scale-[0.97]"

const focusRing = "focus-ring"

const fillClass =
  "absolute inset-0 scale-40 rounded-[inherit] bg-foreground opacity-0 transition-[scale,opacity,background-color] duration-[150ms,110ms,150ms] delay-[15ms,35ms,0ms] ease-standard corner-squircle group-data-checked/checkbox:scale-100 group-data-checked/checkbox:opacity-100 group-data-checked/checkbox:duration-[220ms,60ms,150ms] group-data-checked/checkbox:delay-0 group-data-checked/checkbox:ease-spring group-data-indeterminate/checkbox:scale-100 group-data-indeterminate/checkbox:opacity-100 group-data-indeterminate/checkbox:duration-[220ms,60ms,150ms] group-data-indeterminate/checkbox:delay-0 group-data-indeterminate/checkbox:ease-spring group-[:hover:not([data-disabled],[data-readonly])]/checkbox:bg-(--checkbox-fill-hover) motion-reduce:scale-100 motion-reduce:transition-opacity motion-reduce:duration-120 motion-reduce:delay-0"

// The check, drawn on as its box checks (stroke-dashoffset 1 → 0). Shared
// with the colour picker's picked dots.
export const CHECK_PATH = "M4.6 8.4 L7 10.7 L11.5 5.6"

export const markClass =
  "fill-none stroke-background stroke-[1.75] [stroke-dasharray:1] [stroke-dashoffset:1] [stroke-linecap:round] [stroke-linejoin:round] transition-[stroke-dashoffset] duration-80 ease-standard motion-reduce:transition-none"

// The box's own classes (also drawn outside React: the editor's checklist
// items, editor/checklist-item-node.ts).
export const checkboxClass = (variant: keyof typeof variants = "default") =>
  cn(
    "group/checkbox relative inline-grid shrink-0 cursor-pointer place-items-center rounded-(--cb-r) align-middle transition-[box-shadow,scale] duration-[150ms,120ms] ease-standard outline-none corner-squircle data-[disabled]:cursor-not-allowed data-[disabled]:opacity-45 data-[readonly]:cursor-default motion-reduce:transition-none",
    variant === "default"
      ? cn("before:absolute before:-inset-2 before:content-['']", interactive)
      : "[&:not([data-disabled],[data-readonly])]:active:scale-[0.97]",
    variants[variant]
  )

export const checkboxFillClass = fillClass

export const checkboxCheckClass = cn(
  markClass,
  "group-data-checked/checkbox:delay-60 group-data-checked/checkbox:duration-160 group-data-checked/checkbox:[stroke-dashoffset:0] motion-reduce:delay-0"
)

function Checkbox({
  className,
  variant = "default",
  ...props
}: React.ComponentProps<typeof CheckboxPrimitive.Root> &
  Readonly<{ variant?: keyof typeof variants }>) {
  return (
    <CheckboxPrimitive.Root
      data-slot="checkbox"
      className={cn(checkboxClass(variant), focusRing, className)}
      {...props}
    >
      {variant === "quiet" ? (
        <span aria-hidden className={quietBoxClass}>
          <Box />
        </span>
      ) : (
        <Box />
      )}
    </CheckboxPrimitive.Root>
  )
}

// The box alone, for a row that is itself the control (a toggle button
// with aria-pressed): it shows the state and takes no input of its own.
function CheckboxIndicator({
  checked,
  disabled = false,
  className
}: Readonly<{ checked: boolean; disabled?: boolean; className?: string }>) {
  return (
    <span
      aria-hidden
      data-slot="checkbox-indicator"
      data-checked={checked ? "" : undefined}
      data-disabled={disabled ? "" : undefined}
      className={cn(checkboxClass(), className)}
    >
      <Box />
    </span>
  )
}

// The fill and the mark, drawn over the box.
function Box() {
  return (
    <>
      <span aria-hidden className={fillClass} />
      <svg
        aria-hidden
        viewBox="0 0 16 16"
        className="relative size-full overflow-visible"
      >
        <path pathLength={1} d={CHECK_PATH} className={checkboxCheckClass} />
        <path
          pathLength={1}
          d="M5 8 H11"
          className={cn(
            markClass,
            "group-data-indeterminate/checkbox:delay-60 group-data-indeterminate/checkbox:duration-160 group-data-indeterminate/checkbox:[stroke-dashoffset:0] motion-reduce:delay-0"
          )}
        />
      </svg>
    </>
  )
}

export { Checkbox, CheckboxIndicator }
