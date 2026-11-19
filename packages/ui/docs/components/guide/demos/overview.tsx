import { Button } from "@pp/ui/button"
import { Guide } from "@pp/ui/guide"
import { Bell, Filter, Plus } from "@pp/ui/icons"
import { useRef, useState } from "react"

// A small toolbar, and a guide that teaches one of its buttons. The rest
// blurs and dims; the button stays live, so you can press it while the
// guide is up. "Got it", Escape or a click elsewhere closes it.
export default function Overview() {
  const [open, setOpen] = useState(false)
  const [filters, setFilters] = useState(0)
  const target = useRef<HTMLButtonElement>(null)
  return (
    <div className="flex w-full flex-col items-center gap-6 rounded-xl bg-page p-6">
      <Button size="sm" variant="primary" onClick={() => setOpen(true)}>
        Show the guide
      </Button>
      <div className="flex items-center gap-1.5 rounded-[16px] bg-card p-1.5 shadow-(--tooltip-edge)">
        <Button size="sm" variant="ghost" leadingIcon={Plus}>
          New ticket
        </Button>
        <Button
          ref={target}
          size="sm"
          variant="ghost"
          leadingIcon={Filter}
          onClick={() => setFilters((count) => count + 1)}
        >
          {filters === 0 ? "Filter" : `Filter (${filters})`}
        </Button>
        <Button
          size="sm"
          variant="ghost"
          leadingIcon={Bell}
          aria-label="Notifications"
        />
      </div>
      <Guide
        open={open}
        onClose={() => setOpen(false)}
        target={target}
        title="Narrow the list"
        doneLabel="Got it"
        step="1 of 1"
      >
        Filter by status, assignee or label; the list keeps your filters until
        you clear them. Press F to open it from anywhere.
      </Guide>
    </div>
  )
}
