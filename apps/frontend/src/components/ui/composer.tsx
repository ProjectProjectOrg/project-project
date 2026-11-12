import { Info } from "lucide-react"
import type { ComponentProps, ReactNode } from "react"

import { PopoverContent } from "@/components/ui/popover"
import { cn } from "@/lib/utils"

function ComposerPopover({
  className,
  ...props
}: Readonly<ComponentProps<typeof PopoverContent>>) {
  return (
    <PopoverContent
      className={cn(
        "w-[min(32rem,calc(100vw-2rem))] p-0 shadow-[0_8px_24px_rgba(0,0,0,0.08)] dark:shadow-[0_8px_24px_rgba(0,0,0,0.4)]",
        className
      )}
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

function Body({ className, ...props }: Readonly<ComponentProps<"div">>) {
  return (
    <div
      className={cn("mt-1 max-h-[50dvh] overflow-y-auto px-4", className)}
      {...props}
    />
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
