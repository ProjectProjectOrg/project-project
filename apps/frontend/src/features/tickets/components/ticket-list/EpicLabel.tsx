import { isEpic } from "@pp/shared"
import type { TicketParent } from "@pp/shared"
import { cn } from "@pp/ui/lib/utils"
import { MiddleTruncate } from "@pp/ui/middle-truncate"

export function EpicLink({
  href,
  parent,
  className
}: Readonly<{
  href: string
  parent: TicketParent
  className?: string
}>) {
  return (
    <a
      href={href}
      className={cn(
        "-mx-1.5 -my-1 flex max-w-[24ch] min-w-0 shrink-0 rounded-md px-1.5 py-1 text-muted-foreground underline-offset-4 transition-colors outline-none hover:text-foreground hover:underline focus-visible:ring-1 focus-visible:ring-ring",
        className
      )}
    >
      <MiddleTruncate value={parent.title} />
    </a>
  )
}

export function EpicSeparator({ className }: Readonly<{ className?: string }>) {
  return (
    <span
      aria-hidden
      className={cn(
        "mx-1.5 text-muted-foreground before:content-['/']",
        className
      )}
    />
  )
}

export function EpicTextPrefix({
  parent
}: Readonly<{ parent: TicketParent | null }>) {
  if (!isEpic(parent)) return null
  return (
    <>
      <span className="text-muted-foreground">{parent.title}</span>
      <EpicSeparator />
    </>
  )
}
