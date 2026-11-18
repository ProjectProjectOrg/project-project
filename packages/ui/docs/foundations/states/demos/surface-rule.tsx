import { Button } from "@pp/ui/button"
import { ChevronDown, CircleDot, Copy } from "@pp/ui/icons"
import { Input } from "@pp/ui/input"
import { cn } from "@pp/ui/lib/utils"
import { menuItemClass } from "@pp/ui/menu-styles"
import { SegmentedTabs } from "@pp/ui/segmented-tabs"
import { useState } from "react"

import { Surface, surfaceRuleCss, type SurfaceKind } from "./parts/surface"

const SURFACES: ReadonlyArray<{
  kind: SurfaceKind
  name: string
  note: string
}> = [
  { kind: "page", name: "Page", note: "--page" },
  { kind: "well", name: "Card well", note: "--card (settings groups)" },
  { kind: "popup", name: "Popup", note: "--tooltip (menus, popovers)" },
  { kind: "nested", name: "Nested popup", note: "--tooltip-raised" }
]

const COLUMNS = [
  { name: "Rest", field: undefined, control: undefined },
  { name: "Hover", field: "hover", control: "hover" },
  { name: "Focus · pressed", field: "focus", control: "hover active" }
] as const

const menuRowClass = cn(
  menuItemClass,
  "w-full hover:bg-menu-hover hover:text-foreground active:bg-menu-active"
)

function Controls({ kind }: Readonly<{ kind: SurfaceKind }>) {
  const inPopup = kind === "popup" || kind === "nested"
  return (
    <div className="grid grid-cols-[4.5rem_repeat(3,minmax(0,1fr))] items-center gap-x-2 gap-y-2">
      <span />
      {COLUMNS.map((column) => (
        <span
          key={column.name}
          className="text-center text-micro text-muted-foreground"
        >
          {column.name}
        </span>
      ))}
      <span className="text-caption text-muted-foreground">Input</span>
      {COLUMNS.map((column) => (
        <Input
          key={column.name}
          aria-label={`Search, ${column.name}`}
          placeholder="Search"
          data-force={column.field}
        />
      ))}
      <span className="text-caption text-muted-foreground">Select</span>
      {COLUMNS.map((column) => (
        <Button key={column.name} variant="field" data-force={column.field}>
          Sprint
          <ChevronDown className="size-4" strokeWidth={1.75} />
        </Button>
      ))}
      <span className="text-caption text-muted-foreground">
        {inPopup ? "Menu row" : "Ghost"}
      </span>
      {COLUMNS.map((column) =>
        inPopup ? (
          <div
            key={column.name}
            data-force={column.control}
            className={menuRowClass}
          >
            <Copy strokeWidth={1.75} />
            Copy link
          </div>
        ) : (
          <Button
            key={column.name}
            variant="ghost"
            data-force={column.control}
            className="justify-start"
          >
            <CircleDot className="size-4" strokeWidth={1.75} />
            Todo
          </Button>
        )
      )}
    </div>
  )
}

// Every surface the app has, with the controls that sit on it, in each
// state, pinned so they show at once. Switch between today's tokens and
// the surface rule; everything stays live, so hover and press them too.
export default function SurfaceRule() {
  const [mode, setMode] = useState<"today" | "proposed">("proposed")
  return (
    <div className="@container flex w-full flex-col gap-4">
      <style>{surfaceRuleCss}</style>
      <div className="w-64">
        <SegmentedTabs
          fill
          items={[
            { key: "today", label: "Today" },
            { key: "proposed", label: "Proposed" }
          ]}
          value={mode}
          onValueChange={setMode}
        />
      </div>
      <div
        className={cn(
          "flex flex-col gap-3 rounded-[22px] bg-background p-3 [corner-shape:var(--button-corner)]",
          mode === "proposed" && "surface-rule"
        )}
      >
        {SURFACES.map((surface) => (
          <Surface key={surface.kind} kind={surface.kind} className="p-3">
            <div className="mb-2 flex items-baseline gap-2">
              <span className="text-caption font-semibold">{surface.name}</span>
              <span className="text-micro text-muted-foreground">
                {surface.note}
              </span>
            </div>
            <Controls kind={surface.kind} />
          </Surface>
        ))}
      </div>
    </div>
  )
}
