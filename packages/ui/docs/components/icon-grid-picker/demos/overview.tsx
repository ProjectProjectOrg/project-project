import { IconGridPicker } from "@pp/ui/icon-grid-picker"
import { useState } from "react"

import { ICONS, ICON_NAMES, type IconName } from "./parts/icons"

// The trigger shows the current icon; the grid draws every icon in the
// colour it will be used in, with the current one pressed.
export default function Overview() {
  const [icon, setIcon] = useState<IconName>("CircleDot")
  const Current = ICONS[icon]
  const color = "oklch(0.7 0.16 250)"
  return (
    <div className="flex items-center gap-3">
      <IconGridPicker
        value={icon}
        options={ICON_NAMES}
        onChange={setIcon}
        triggerLabel="Pick icon"
        triggerIcon={<Current className="size-4" style={{ color }} />}
        optionLabel={(name) => `Icon ${name}`}
        renderIcon={(name) => {
          const Icon = ICONS[name]
          return <Icon className="size-3.5" style={{ color }} />
        }}
      />
      <IconGridPicker
        value={icon}
        options={ICON_NAMES}
        onChange={setIcon}
        disabled
        triggerLabel="Pick icon (disabled)"
        triggerIcon={<Current className="size-4" style={{ color }} />}
        optionLabel={(name) => `Icon ${name}`}
        renderIcon={(name) => {
          const Icon = ICONS[name]
          return <Icon className="size-3.5" />
        }}
      />
    </div>
  )
}
