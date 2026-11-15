import { Badge } from "@pp/ui/badge"
import { Button } from "@pp/ui/button"
import {
  Bell,
  BookOpen,
  Bug,
  ChevronDown,
  ListFilter,
  SquareCheck
} from "@pp/ui/icons"
import { TextSwap } from "@pp/ui/text-swap"
import { useState, type ReactNode } from "react"

function Case({
  caption,
  children
}: Readonly<{ caption: string; children: ReactNode }>) {
  return (
    <div className="grid min-w-0 content-start justify-items-start gap-2">
      <span className="text-caption text-muted-foreground">{caption}</span>
      {children}
    </div>
  )
}

const TYPES = [
  { label: "Task", icon: SquareCheck, color: "text-sky-500" },
  { label: "Bug", icon: Bug, color: "text-red-500" },
  { label: "Story", icon: BookOpen, color: "text-emerald-500" }
] as const

// Click each control: the value it shows changes through TextSwap, as in
// the app.
export default function InTheApp() {
  const [type, setType] = useState(0)
  const [subscribed, setSubscribed] = useState(false)
  const [filters, setFilters] = useState(1)
  const current = TYPES[type % TYPES.length]
  const Icon = current.icon

  return (
    <div className="@container grid w-full gap-8 @2xl:grid-cols-[repeat(3,minmax(0,1fr))]">
      <Case caption="Ticket › type chip (TypeField): label and glyph change together">
        <Button
          variant="ghost"
          tone="strong"
          onClick={() => setType((t) => t + 1)}
        >
          <TextSwap
            className="gap-1.5"
            icon={
              <Icon
                className={`size-3.5 ${current.color}`}
                strokeWidth={1.75}
              />
            }
          >
            {current.label}
          </TextSwap>
        </Button>
      </Case>

      <Case caption="Ticket › Subscribe (SubscribeToggle): a toggle's label">
        <Button
          type="button"
          variant="ghost"
          size="compact"
          aria-pressed={subscribed}
          onClick={() => setSubscribed((s) => !s)}
        >
          <Bell className="size-3.5" strokeWidth={1.75} />
          <TextSwap>{subscribed ? "Subscribed" : "Subscribe"}</TextSwap>
        </Button>
      </Case>

      <Case caption="Backlog toolbar › Filters (count, fast)">
        <Button variant="ghost" onClick={() => setFilters((f) => (f % 4) + 1)}>
          <ListFilter className="size-4" strokeWidth={1.75} />
          Filters
          <Badge variant="count" active>
            <TextSwap speed="fast">{String(filters)}</TextSwap>
          </Badge>
          <ChevronDown className="size-3.5" strokeWidth={1.75} />
        </Button>
      </Case>
    </div>
  )
}
