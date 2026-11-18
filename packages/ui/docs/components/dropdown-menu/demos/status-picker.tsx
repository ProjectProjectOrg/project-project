import { Button } from "@pp/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuRadioGroup,
  DropdownMenuSeparator,
  DropdownMenuTrigger
} from "@pp/ui/dropdown-menu"
import {
  ArrowRight,
  Check,
  Circle,
  CircleDashed,
  CircleDot,
  GitPullRequest
} from "@pp/ui/icons"
import { useState } from "react"

const USER_TOGGLES = new Set(["trigger-press", "escape-key"])

const STATUSES = [
  {
    value: "backlog",
    label: "Backlog",
    icon: CircleDashed,
    tone: "text-muted-foreground"
  },
  { value: "todo", label: "Todo", icon: Circle, tone: "text-muted-foreground" },
  {
    value: "in-progress",
    label: "In progress",
    icon: CircleDot,
    tone: "text-state-info"
  },
  {
    value: "in-review",
    label: "In review",
    icon: GitPullRequest,
    tone: "text-state-merged"
  },
  { value: "done", label: "Done", icon: Check, tone: "text-state-success" }
] as const

type Status = (typeof STATUSES)[number]["value"]

export default function StatusPicker() {
  const [open, setOpen] = useState(true)
  const [status, setStatus] = useState<Status>("in-progress")
  const current = STATUSES.find((option) => option.value === status)
  const CurrentIcon = current?.icon ?? Circle

  return (
    <DropdownMenu
      open={open}
      onOpenChange={(next, details) => {
        if (USER_TOGGLES.has(details.reason)) setOpen(next)
      }}
      modal={false}
    >
      <DropdownMenuTrigger
        render={
          <Button
            variant="ghost"
            tone="strong"
            aria-label={`Status: ${current?.label}`}
          />
        }
      >
        <CurrentIcon
          className={`size-3.5 ${current?.tone ?? ""}`}
          strokeWidth={1.75}
        />
        {current?.label}
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" sideOffset={6} className="w-44">
        <DropdownMenuRadioGroup
          value={status}
          onValueChange={setStatus}
          items={STATUSES.map(({ value, label, icon: Icon, tone }) => ({
            value,
            textValue: label,
            closeOnClick: true,
            label: (
              <>
                <Icon className={`size-4 ${tone}`} strokeWidth={1.75} />
                {label}
              </>
            )
          }))}
        />
        <DropdownMenuSeparator />
        <DropdownMenuItem>
          Manage statuses
          <ArrowRight className="ml-auto size-3.5" />
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
