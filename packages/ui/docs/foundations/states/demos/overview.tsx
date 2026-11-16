import { Button } from "@pp/ui/button"
import { Checkbox } from "@pp/ui/checkbox"
import { Input } from "@pp/ui/input"
import type { ReactNode } from "react"

const COLUMNS = ["Rest", "Hover", "Pressed", "Focus", "Disabled"] as const
const FORCE: Record<(typeof COLUMNS)[number], string | undefined> = {
  Rest: undefined,
  Hover: "hover",
  Pressed: "hover active",
  Focus: "focus",
  Disabled: undefined
}

function Row({
  name,
  render
}: Readonly<{
  name: string
  render: (force: string | undefined, disabled: boolean) => ReactNode
}>) {
  return (
    <>
      <span className="self-center text-caption font-semibold">{name}</span>
      {COLUMNS.map((column) => (
        <div key={column} className="flex items-center justify-center py-2">
          {render(FORCE[column], column === "Disabled")}
        </div>
      ))}
    </>
  )
}

// Every state on four kinds of control, pinned so they show at once.
export default function StatesOverview() {
  return (
    <div className="@container w-full overflow-x-auto">
      <div className="grid min-w-[40rem] grid-cols-[6rem_repeat(5,minmax(0,1fr))] gap-x-2">
        <span />
        {COLUMNS.map((column) => (
          <span
            key={column}
            className="pb-2 text-center text-caption text-muted-foreground"
          >
            {column}
          </span>
        ))}
        <Row
          name="Button"
          render={(force, disabled) => (
            <Button data-force={force} disabled={disabled}>
              Save
            </Button>
          )}
        />
        <Row
          name="Ghost"
          render={(force, disabled) => (
            <Button variant="ghost" data-force={force} disabled={disabled}>
              Back
            </Button>
          )}
        />
        <Row
          name="Field"
          render={(force, disabled) => (
            <Input
              aria-label="Title"
              placeholder="Title"
              data-force={force}
              disabled={disabled}
              className="w-28"
            />
          )}
        />
        <Row
          name="Checkbox"
          render={(force, disabled) => (
            <Checkbox
              aria-label="Done"
              defaultChecked
              data-force={force}
              disabled={disabled}
            />
          )}
        />
      </div>
    </div>
  )
}
