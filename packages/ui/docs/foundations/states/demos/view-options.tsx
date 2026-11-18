import { Button } from "@pp/ui/button"
import { Check, ChevronDown, Columns3, Rows3 } from "@pp/ui/icons"
import { cn } from "@pp/ui/lib/utils"
import { menuItemClass } from "@pp/ui/menu-styles"
import { SegmentedTabs } from "@pp/ui/segmented-tabs"
import { useState } from "react"

import { Compare } from "./parts/compare"
import { Surface } from "./parts/surface"

const menuRowClass = cn(
  menuItemClass,
  "w-full hover:bg-menu-hover hover:text-foreground active:bg-menu-active"
)

const OPTIONS = ["Collapsed", "Expanded", "Hidden"] as const

const FIELDS = [
  { label: "Grouping", value: "Sprint", force: "focus", state: "Focused" },
  { label: "Ordering", value: "Manual", force: "hover", state: "Hovered" },
  { label: "Sub-tickets", value: "Collapsed", force: undefined, state: "Open" }
] as const

const OPTION_STATES: Record<(typeof OPTIONS)[number], string> = {
  Collapsed: "Checked",
  Expanded: "Hovered",
  Hidden: "Rest"
}

// View options as the app draws it: a popover on the page with Grouping
// focused and Ordering hovered, and the Sub-tickets select open below it
// as a nested popup with Expanded hovered. The captions sit outside the
// popups, beside the row they name. In popups the two systems land close
// together: today's popup tokens already stand in for the rule.
function ViewOptions() {
  const [view, setView] = useState<"list" | "board">("list")
  return (
    <Surface kind="page" className="relative min-h-[23rem] p-3">
      <div className="flex gap-3">
        <Surface kind="popup" className="w-72 shrink-0 space-y-2 p-3">
          <SegmentedTabs
            fill
            items={[
              { key: "list", label: "List", icon: Rows3 },
              { key: "board", label: "Board", icon: Columns3 }
            ]}
            value={view}
            onValueChange={setView}
          />
          {FIELDS.map((field) => (
            <div
              key={field.label}
              className="flex items-center justify-between gap-3"
            >
              <span className="text-body text-muted-foreground">
                {field.label}
              </span>
              <Button variant="field" data-force={field.force} className="w-36">
                {field.value}
                <ChevronDown className="size-4" strokeWidth={1.75} />
              </Button>
            </div>
          ))}
        </Surface>
        {/* Popover padding (12px), the tabs (36px) and the gap (8px). */}
        <div className="flex flex-col gap-2 pt-14">
          {FIELDS.map((field) => (
            <span
              key={field.label}
              className="flex h-8 items-center text-caption text-muted-foreground"
            >
              {field.state}
            </span>
          ))}
        </div>
      </div>
      <div className="absolute top-[11.5rem] left-[11rem] flex gap-3">
        <Surface kind="nested" className="w-52 shrink-0 p-[5px]">
          {OPTIONS.map((option) => (
            <div
              key={option}
              data-force={option === "Expanded" ? "hover" : undefined}
              className={menuRowClass}
            >
              {option}
              {option === "Collapsed" && <Check className="ml-auto size-4" />}
            </div>
          ))}
        </Surface>
        <div className="flex flex-col py-[5px]">
          {OPTIONS.map((option) => (
            <span
              key={option}
              className="flex h-9 items-center text-caption text-muted-foreground"
            >
              {OPTION_STATES[option]}
            </span>
          ))}
        </div>
      </div>
    </Surface>
  )
}

export default function ViewOptionsCompared() {
  return <Compare scene={() => <ViewOptions />} />
}
