import { STRONG_RING } from "@pp/shared"
import { Button } from "@pp/ui/button"
import { ColorPicker } from "@pp/ui/color-picker"
import { IconGridPicker } from "@pp/ui/icon-grid-picker"
import { Input } from "@pp/ui/input"
import { useState } from "react"

import { ICONS, ICON_NAMES, type IconName } from "./parts/icons"

// The status editor in project settings (Workflow): the icon, then its
// colour, then the name and what it means. A built-in status keeps its
// icon, shown as a plain glyph in the trigger's place.
export default function InTheApp() {
  const [icon, setIcon] = useState<IconName>("Eye")
  const [color, setColor] = useState<string>(STRONG_RING[8].hex)
  const Current = ICONS[icon]
  return (
    <div className="grid w-full max-w-2xl gap-3">
      <div className="flex min-h-14 items-center gap-2 rounded-lg border border-border bg-card py-2 pr-2 pl-1">
        <span className="w-4 shrink-0" />
        <IconGridPicker
          value={icon}
          options={ICON_NAMES}
          onChange={setIcon}
          triggerLabel="Pick status icon"
          triggerIcon={<Current className="size-4" style={{ color }} />}
          optionLabel={(name) => `Icon ${name}`}
          renderIcon={(name) => {
            const Icon = ICONS[name]
            return <Icon className="size-3.5" style={{ color }} />
          }}
        />
        <ColorPicker
          value={color}
          onChange={setColor}
          ariaLabel="Pick status color"
          swatchLabel={(hex) => `Colour ${hex}`}
        />
        <Input
          defaultValue="In review"
          aria-label="Status name"
          className="h-8 w-40 shrink-0 rounded-lg"
        />
        <Input
          placeholder="What this status means, for people and agents"
          aria-label="Status description"
          className="h-8 min-w-0 flex-1 rounded-lg"
        />
        <Button type="button" size="sm" variant="ghost">
          Cancel
        </Button>
        <Button type="button" size="sm" variant="primary">
          Save
        </Button>
      </div>
    </div>
  )
}
