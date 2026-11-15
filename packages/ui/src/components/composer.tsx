import { Info } from "lucide-react"
import type { ComponentProps, ReactNode } from "react"

import { cn } from "../lib/utils"
import { bareFieldClass } from "./input"
import { PopoverContent } from "./popover"

function ComposerPopover({
  className,
  ...props
}: Readonly<ComponentProps<typeof PopoverContent>>) {
  return (
    <PopoverContent
      className={cn("w-[min(32rem,calc(100vw-2rem))] p-0", className)}
      {...props}
    />
  )
}

function Header({ className, ...props }: Readonly<ComponentProps<"div">>) {
  return (
    <div
      className={cn("flex items-center gap-2 pt-4 pr-4 pl-1.5", className)}
      {...props}
    />
  )
}

function Title({ className, ...props }: Readonly<ComponentProps<"div">>) {
  return (
    <div
      className={cn("mt-3 px-4 text-title font-semibold", className)}
      {...props}
    />
  )
}

// The description area. Like a bare Input it tints on hover and, lighter,
// while focused. The tint sits on an inner box inside the scroller (a
// scroller clips negative margins), 8px past the text on each side.
function Body({
  className,
  children,
  ...props
}: Readonly<ComponentProps<"div">>) {
  return (
    <div
      className={cn("mt-2 max-h-[50dvh] overflow-y-auto px-2", className)}
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

function Chips({ className, ...props }: Readonly<ComponentProps<"div">>) {
  return (
    <div
      className={cn(
        "flex flex-wrap items-center gap-1.5 pt-2 pr-4 pl-1.5",
        className
      )}
      {...props}
    />
  )
}

function Hint({ className, children }: Readonly<ComponentProps<"span">>) {
  return (
    <span
      className={cn(
        "flex items-center gap-1 px-1 text-caption text-muted-foreground",
        className
      )}
    >
      <Info className="size-3.5 shrink-0" strokeWidth={1.75} />
      {children}
    </span>
  )
}

function ErrorMessage({ children }: Readonly<{ children: ReactNode }>) {
  if (children === null || children === undefined || children === false)
    return null
  return (
    <p
      role="alert"
      className="mx-4 mt-3 rounded-lg bg-destructive-light px-3 py-2 text-body text-destructive"
    >
      {children}
    </p>
  )
}

function Footer({ className, ...props }: Readonly<ComponentProps<"div">>) {
  return (
    <div
      className={cn(
        "mt-4 flex items-center justify-end gap-2 border-t border-border/60 px-4 py-3",
        className
      )}
      {...props}
    />
  )
}

export const Composer = {
  Popover: ComposerPopover,
  Header,
  Title,
  Body,
  Chips,
  Hint,
  Error: ErrorMessage,
  Footer
}
