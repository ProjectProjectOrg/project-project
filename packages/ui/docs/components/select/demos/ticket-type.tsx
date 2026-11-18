import { Button } from "@pp/ui/button"
import {
  Bug,
  CircleDashed,
  Layers,
  Pencil,
  Sparkles,
  SquareCheck,
  type IconType
} from "@pp/ui/icons"
import { Select, SelectTrigger, type SelectOption } from "@pp/ui/select"
import { TextSwap } from "@pp/ui/text-swap"
import { useState } from "react"

const TYPES = [
  { key: "bug", name: "Bug", icon: Bug, color: "var(--state-danger)" },
  {
    key: "feature",
    name: "Feature",
    icon: Sparkles,
    color: "var(--state-merged)"
  },
  { key: "task", name: "Task", icon: SquareCheck, color: "var(--state-info)" },
  { key: "epic", name: "Epic", icon: Layers, color: "var(--state-warning)" }
] as const

const NONE = "none"
const EDIT = "edit"

function Glyph({
  icon: Icon,
  color
}: Readonly<{ icon: IconType; color?: string }>) {
  return (
    <Icon
      aria-hidden
      className="size-4 shrink-0"
      strokeWidth={1.75}
      style={color ? { color } : undefined}
    />
  )
}

// The type field on a ticket: a ghost trigger showing the type's glyph and
// name, the project's types with "No type" after a separator, and an
// "Edit types…" row that runs an action instead of becoming the value.
export default function TicketType() {
  const [type, setType] = useState<string>("bug")
  const [edits, setEdits] = useState(0)
  const current = TYPES.find((option) => option.key === type)
  const items: ReadonlyArray<SelectOption<string>> = [
    ...TYPES.map((option, index) => ({
      value: option.key,
      textValue: option.name,
      separated: index === TYPES.length - 1,
      label: (
        <>
          <Glyph icon={option.icon} color={option.color} />
          <span className="truncate">{option.name}</span>
        </>
      )
    })),
    {
      value: NONE,
      textValue: "No type",
      separated: true,
      label: (
        <>
          <Glyph icon={CircleDashed} />
          <span className="truncate text-muted-foreground">No type</span>
        </>
      )
    },
    {
      value: EDIT,
      textValue: "Edit types…",
      label: (
        <>
          <Glyph icon={Pencil} />
          Edit types…
        </>
      ),
      onAction: () => setEdits((count) => count + 1)
    }
  ]
  return (
    <div className="flex flex-col items-center gap-3">
      <Select
        value={type}
        onValueChange={(next: string) => setType(next)}
        items={items}
        contentProps={{ align: "start", className: "w-56" }}
      >
        <SelectTrigger
          render={
            <Button
              type="button"
              variant="ghost"
              tone={current ? "strong" : "muted"}
              aria-label={`Type: ${current?.name ?? "No type"}`}
            />
          }
        >
          <TextSwap
            className="gap-1.5"
            icon={
              <Glyph
                icon={current?.icon ?? CircleDashed}
                color={current?.color}
              />
            }
          >
            {current?.name ?? "No type"}
          </TextSwap>
        </SelectTrigger>
      </Select>
      <p className="text-caption text-muted-foreground" aria-live="polite">
        {edits === 0
          ? "“Edit types…” runs an action instead of picking a value."
          : `Would open the type editor (${edits}×)`}
      </p>
    </div>
  )
}
