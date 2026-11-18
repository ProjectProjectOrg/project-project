import { Button } from "@pp/ui/button"
import {
  ChevronDown,
  CircleDashed,
  CircleDot,
  ListFilter,
  SlidersHorizontal
} from "@pp/ui/icons"
import { Input } from "@pp/ui/input"

import { Compare, Pinned, SideCaption } from "./parts/compare"
import { Surface } from "./parts/surface"

const ROWS = [
  { key: "AV-17", title: "Wire up the export button", icon: CircleDashed },
  {
    key: "AV-16",
    title: "Fix date parsing in the CSV importer",
    icon: CircleDot
  },
  { key: "AV-15", title: "Document the export format", icon: CircleDashed }
]

// The backlog on the page: the search field has keyboard focus, Filters is
// hovered, and the second row is under the pointer. Today, in dark, the
// focused field takes on the page's own fill and only its ring sets it
// apart; under the rule it stays a well.
function Toolbar() {
  return (
    <Surface kind="page" className="flex flex-col gap-3 p-3">
      <div className="flex flex-wrap items-start gap-2">
        <Pinned state="Focused" className="min-w-40 flex-1">
          <Input
            aria-label="Search tickets"
            placeholder="Search tickets…"
            data-force="focus"
          />
        </Pinned>
        <Pinned state="Hovered">
          <Button variant="field" data-force="hover">
            <ListFilter className="size-4" strokeWidth={1.75} />
            Filters
            <ChevronDown className="size-4" strokeWidth={1.75} />
          </Button>
        </Pinned>
        <Pinned state="Rest">
          <Button variant="field">
            <SlidersHorizontal className="size-4" strokeWidth={1.75} />
            View
            <ChevronDown className="size-4" strokeWidth={1.75} />
          </Button>
        </Pinned>
      </div>
      <ul className="flex flex-col">
        {ROWS.map((row, index) => (
          <li key={row.key} className="flex items-center gap-2">
            <button
              type="button"
              data-force={index === 1 ? "hover" : undefined}
              className="flex h-10 min-w-0 flex-1 items-center gap-3 rounded-[20px] px-3 text-left text-body transition-colors duration-150 [corner-shape:var(--button-corner)] hover:bg-hover hover:duration-0 active:bg-active"
            >
              <row.icon className="size-4 shrink-0 text-muted-foreground" />
              <span className="text-caption text-muted-foreground tabular-nums">
                {row.key}
              </span>
              <span className="truncate">{row.title}</span>
            </button>
            <SideCaption state={index === 1 ? "Hovered" : "Rest"} />
          </li>
        ))}
      </ul>
    </Surface>
  )
}

export default function ToolbarCompared() {
  return <Compare scene={() => <Toolbar />} />
}
