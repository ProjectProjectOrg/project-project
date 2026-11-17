import type { ComponentProps, ReactNode } from "react"

import { cn } from "../lib/utils"
import { Info } from "./icons"
import { bareFieldClass } from "./input"
import { popupSurfaceClass } from "./menu-styles"
import { PopoverContent } from "./popover"

// A composer is a small form in two zones. The card holds the writing:
// context, title and body. Below it, the tray (a tint between the card and
// the page) holds everything that isn't writing: the fields, a note and the
// actions. Every part owns its spacing, so call sites never pad them; text
// starts 16px in throughout, and the tray's buttons sit 6px from its edges.
//
// Order: Header? Title Body Error? Tray( Fields? Footer( Hint? Actions ) )

// 20px corners: the tray's 14px buttons plus their 6px inset, concentric.
const surfaceShape =
  "w-[min(32rem,calc(100vw-2rem))] overflow-hidden rounded-[20px] p-0 [corner-shape:var(--button-corner)]"

function ComposerPopover({
  className,
  ...props
}: Readonly<ComponentProps<typeof PopoverContent>>) {
  return <PopoverContent className={cn(surfaceShape, className)} {...props} />
}

// The same surface in place, without a popover: for a composer shown
// inline, or on its own (the gallery).
function Surface({ className, ...props }: Readonly<ComponentProps<"div">>) {
  return (
    <div
      data-slot="composer-surface"
      className={cn(popupSurfaceClass, surfaceShape, className)}
      {...props}
    />
  )
}

// The context line: what the composer acts on or relates to ("Archive
// PP-214", "Blocks PP-214"). With `control`, it holds a control instead
// (feedback's kind tabs): the control's edge sits on the 16px text line,
// 16px from the top, like the text below it. A ghost button opening the
// line (cmd+k's project picker) is a field chip: 28px with 10px sides,
// pulled out by those sides so its icon starts on the 16px line.
function Header({
  className,
  control = false,
  ...props
}: Readonly<ComponentProps<"div"> & { control?: boolean }>) {
  return (
    <div
      data-slot="composer-header"
      data-control={control || undefined}
      className={cn(
        "flex min-w-0 items-center gap-2 px-4 text-body text-muted-foreground",
        "[&>[data-slot=button]:first-child]:-ml-2.5 [&>[data-slot=button]:first-child]:h-7 [&>[data-slot=button]:first-child]:rounded-[14px] [&>[data-slot=button]:first-child]:px-2.5",
        control ? "pt-4" : "pt-3.5",
        className
      )}
      {...props}
    />
  )
}

// The title: a bare Input, or the subject's title as text. Under a text
// header it tucks up; under a control, its text lands 16px below the control
// (the input's box starts 10px down); first in the card it gets 16px.
function Title({ className, ...props }: Readonly<ComponentProps<"div">>) {
  return (
    <div
      data-slot="composer-title"
      className={cn(
        "min-w-0 px-4 pt-4 text-title font-semibold [&_input]:text-title [&_input]:font-semibold [[data-slot=composer-header]+&]:pt-1.5 [[data-slot=composer-header][data-control]+&]:pt-2.5",
        className
      )}
      {...props}
    />
  )
}

// The description area. Like a bare Input it tints on hover and, lighter,
// while focused. The tint sits on an inner box inside the scroller (a
// scroller clips negative margins), 8px past the text on each side. Its
// box ends 6px above the tray, mirroring the tray's 6px inside.
function Body({
  className,
  children,
  ...props
}: Readonly<ComponentProps<"div">>) {
  return (
    <div
      data-slot="composer-body"
      className={cn(
        "max-h-[50dvh] overflow-y-auto px-2 pt-1.5 pb-1.5",
        className
      )}
      {...props}
    >
      <div
        className={cn(
          bareFieldClass,
          "mx-0 my-0 w-auto cursor-text has-[[contenteditable=false]]:cursor-default"
        )}
      >
        {children}
      </div>
    </div>
  )
}

function ErrorMessage({ children }: Readonly<{ children: ReactNode }>) {
  if (children === null || children === undefined || children === false)
    return null
  return (
    <p
      role="alert"
      className="mx-4 mb-3 rounded-lg bg-destructive-light px-3 py-2 text-body text-destructive"
    >
      {children}
    </p>
  )
}

// Everything that isn't writing, on the tray tint.
function Tray({ className, ...props }: Readonly<ComponentProps<"div">>) {
  return (
    <div
      data-slot="composer-tray"
      className={cn(
        "mt-auto flex flex-col gap-1 bg-(--composer-tray) p-1.5",
        className
      )}
      {...props}
    />
  )
}

// Field chips (status, type, priority, a reason…). Whatever button a select
// renders, here it is 28px with 10px sides, so every chip's icon starts on
// the same 16px line as the text above.
function Fields({ className, ...props }: Readonly<ComponentProps<"div">>) {
  return (
    <div
      data-slot="composer-fields"
      className={cn(
        "flex flex-wrap items-center gap-0.5 [&_[data-slot=button]]:h-7 [&_[data-slot=button]]:rounded-[14px] [&_[data-slot=button]]:px-2.5",
        className
      )}
      {...props}
    />
  )
}

// The last row: a Hint (or a secondary control) at the start, Actions at
// the end. A button placed straight in the row (a sprint's dates, "Add
// existing") gets a chip's 10px start, so its icon is on the 16px line.
function Footer({ className, ...props }: Readonly<ComponentProps<"div">>) {
  return (
    <div
      data-slot="composer-footer"
      className={cn(
        "flex min-h-7 min-w-0 items-center gap-1 [&>[data-slot=button]]:pl-2.5",
        className
      )}
      {...props}
    />
  )
}

function Actions({ className, ...props }: Readonly<ComponentProps<"div">>) {
  return (
    <div
      data-slot="composer-actions"
      // Bottom-aligned: a hint that wraps to two lines grows the row, and the
      // buttons stay 6px off the tray's bottom edge.
      className={cn(
        "ml-auto flex shrink-0 items-center gap-1 self-end",
        className
      )}
      {...props}
    />
  )
}

function Hint({ className, children }: Readonly<ComponentProps<"span">>) {
  return (
    <span
      data-slot="composer-hint"
      className={cn(
        "flex min-w-0 items-center gap-1.5 px-2.5 text-caption text-muted-foreground",
        className
      )}
    >
      <Info className="size-3.5 shrink-0" strokeWidth={1.75} />
      {/* Trimmed to cap height, so the letters (not the line box) centre
          on the icon. */}
      <span className="min-w-0 [text-box:trim-both_cap_alphabetic]">
        {children}
      </span>
    </span>
  )
}

export const Composer = {
  Popover: ComposerPopover,
  Surface,
  Header,
  Title,
  Body,
  Error: ErrorMessage,
  Tray,
  Fields,
  Footer,
  Actions,
  Hint
}
