import { useEffect, useState } from "react"

import { Button } from "@/components/ui/button"
import { Kbd } from "@/components/ui/kbd"
import type { ClearedRow } from "@/features/inbox/hooks/useInboxActions"
import { m } from "@/paraglide/messages"

const SHOW_MS = 6000

type UndoProps = Readonly<{
  cleared: ClearedRow
  onUndo: () => void
  onDismiss: () => void
}>

export function InboxUndoBar({
  cleared,
  onUndo,
  onDismiss
}: Omit<UndoProps, "cleared"> & Readonly<{ cleared: ClearedRow | null }>) {
  return (
    <output className="pointer-events-none absolute inset-x-0 bottom-4 z-20 flex justify-center px-4">
      {cleared !== null && (
        <Undo
          key={`${cleared.item.projectSlug}/${cleared.item.ticket.id}`}
          cleared={cleared}
          onUndo={onUndo}
          onDismiss={onDismiss}
        />
      )}
    </output>
  )
}

function Undo({ cleared, onUndo, onDismiss }: UndoProps) {
  const [paused, setPaused] = useState(false)
  useEffect(() => {
    if (paused) return undefined
    const timer = window.setTimeout(onDismiss, SHOW_MS)
    return () => window.clearTimeout(timer)
  }, [paused, onDismiss])

  return (
    <div
      onPointerEnter={() => setPaused(true)}
      onPointerLeave={() => setPaused(false)}
      onFocus={() => setPaused(true)}
      onBlur={() => setPaused(false)}
      className="pointer-events-auto flex max-w-full animate-in items-center gap-3 rounded-lg border bg-popover py-1 pr-1 pl-3 text-body text-popover-foreground shadow-lg duration-150 ease-out fade-in-0 slide-in-from-bottom-2 motion-reduce:animate-none"
    >
      <span className="min-w-0 truncate">
        {cleared.unsubscribed ? m.inbox_unsubscribed() : m.inbox_marked_done()}
        <span className="text-muted-foreground">
          {" · "}
          {cleared.item.ticket.title}
        </span>
      </span>
      <Button variant="ghost" size="sm" onClick={onUndo}>
        {m.inbox_undo()}
        <Kbd className="max-md:hidden">Z</Kbd>
      </Button>
    </div>
  )
}
