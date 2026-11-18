import {
  HoverCard,
  HoverCardContent,
  HoverCardTrigger
} from "@pp/ui/hover-card"
import type { IconType } from "@pp/ui/icons"
import { cn } from "@pp/ui/lib/utils"
import type { ReactElement, ReactNode } from "react"

export function GitPreview({
  trigger,
  preview,
  children
}: Readonly<{
  trigger: ReactElement
  preview: ReactNode
  children: ReactNode
}>) {
  return (
    <HoverCard>
      <HoverCardTrigger render={trigger}>{children}</HoverCardTrigger>
      <HoverCardContent className="pointer-events-none flex w-72 flex-col gap-2">
        {preview}
      </HoverCardContent>
    </HoverCard>
  )
}

export function PreviewTitle({
  mono = false,
  children
}: Readonly<{ mono?: boolean; children: ReactNode }>) {
  return (
    <div
      className={cn(
        "text-body leading-snug",
        mono ? "break-all tabular-nums" : "line-clamp-2 font-semibold"
      )}
    >
      {children}
    </div>
  )
}

export function PreviewMeta({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <div className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1 text-caption text-muted-foreground">
      {children}
    </div>
  )
}

export function PreviewItem({
  icon: Icon,
  tone,
  children
}: Readonly<{ icon: IconType; tone?: string; children: ReactNode }>) {
  return (
    <span className="inline-flex min-w-0 items-center gap-1">
      <Icon className={cn("size-3.5 shrink-0", tone)} strokeWidth={1.75} />
      {children}
    </span>
  )
}

export function PreviewCallout({
  icon: Icon,
  tone,
  label
}: Readonly<{ icon: IconType; tone: string; label: string }>) {
  return (
    <div className="flex min-w-0 items-center gap-1.5 rounded-md bg-hover px-2 py-1.5 text-caption text-foreground">
      <Icon className={cn("size-3.5 shrink-0", tone)} strokeWidth={1.75} />
      {label}
    </div>
  )
}
