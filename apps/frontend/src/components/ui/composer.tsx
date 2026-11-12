import { Info } from "lucide-react"
import type { ComponentProps, ReactNode } from "react"

import { cn } from "@/lib/utils"

function Header({ className, ...props }: ComponentProps<"div">) {
  return (
    <div
      className={cn("flex items-center gap-2 pt-4 pr-4 pl-1.5", className)}
      {...props}
    />
  )
}

function Title({ className, ...props }: ComponentProps<"div">) {
  return (
    <div
      className={cn("mt-3 px-4 text-title font-semibold", className)}
      {...props}
    />
  )
}

function TitleInput({ className, ...props }: ComponentProps<"input">) {
  return (
    <input
      className={cn(
        "w-full bg-transparent outline-none placeholder:text-muted-foreground",
        className
      )}
      {...props}
    />
  )
}

function Body({ className, ...props }: ComponentProps<"div">) {
  return (
    <div
      className={cn("mt-1 max-h-[50dvh] overflow-y-auto px-4", className)}
      {...props}
    />
  )
}

function Chips({ className, ...props }: ComponentProps<"div">) {
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

function Hint({ className, children }: ComponentProps<"span">) {
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

function Footer({ className, ...props }: ComponentProps<"div">) {
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
  Header,
  Title,
  TitleInput,
  Body,
  Chips,
  Hint,
  Error: ErrorMessage,
  Footer
}
