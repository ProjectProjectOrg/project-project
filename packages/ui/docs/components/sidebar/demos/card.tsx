import { Button } from "@pp/ui/button"
import { ItemLink } from "@pp/ui/item-link"
import { SidebarCard } from "@pp/ui/sidebar"
import { useState } from "react"

export default function CardDemo() {
  const [open, setOpen] = useState(true)
  return (
    <div className="flex h-72 w-59 flex-col justify-between rounded-[14px] bg-background py-2">
      <div className="px-3">
        {open ? null : (
          <Button variant="secondary" size="sm" onClick={() => setOpen(true)}>
            Show again
          </Button>
        )}
      </div>
      <SidebarCard
        open={open}
        title="What's new"
        meta="v2026.11.20 · Nov 20, 2026"
        media={<div className="aspect-video bg-muted" />}
        link={<ItemLink href="#changelog" aria-label="Full changelog" />}
        dismissLabel="Dismiss what's new"
        onDismiss={() => setOpen(false)}
      >
        <ul className="flex flex-col gap-1 text-foreground">
          <li>A card at the bottom of the sidebar shows what changed</li>
          <li>Long descriptions no longer jump while you type</li>
        </ul>
        <span aria-hidden className="mt-2 block font-semibold text-foreground">
          Full changelog
        </span>
      </SidebarCard>
    </div>
  )
}
