import { ChevronDown, Layers } from "lucide-react"

import { CollapsingLabel } from "@/components/SegmentedTabs"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger
} from "@/components/ui/dropdown-menu"
import { m } from "@/paraglide/messages"

import { useTicketToolbar } from "./toolbar/context"
import { ToolbarButton } from "./toolbar/shared"

export function BacklogGroupingControl({
  value,
  onChange
}: {
  value: "status" | "sprint"
  onChange: (value: "status" | "sprint") => void
}) {
  const { controlsCompact } = useTicketToolbar()
  const labels = {
    status: m.tickets_grouping_status(),
    sprint: m.tickets_grouping_sprint()
  }
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <ToolbarButton
            aria-label={m.tickets_grouping_label({ label: labels[value] })}
          >
            <Layers className="size-4" />
            <CollapsingLabel show={!controlsCompact}>
              {m.tickets_grouping_label({ label: labels[value] })}
            </CollapsingLabel>
            <ChevronDown className="size-3.5 opacity-60" />
          </ToolbarButton>
        }
      />
      <DropdownMenuContent align="end">
        <DropdownMenuRadioGroup
          value={value}
          onValueChange={(next) => {
            if (next === "status" || next === "sprint") onChange(next)
          }}
        >
          {(["status", "sprint"] as const).map((option) => (
            <DropdownMenuRadioItem key={option} value={option} closeOnClick>
              {labels[option]}
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
