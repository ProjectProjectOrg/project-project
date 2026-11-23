import { Monitor, Moon, Sun } from "@pp/ui/icons"
import { SegmentedTabs } from "@pp/ui/segmented-tabs"
import { useState } from "react"

type Theme = "light" | "system" | "dark"

export default function InASidebar() {
  const [theme, setTheme] = useState<Theme>("light")
  const [mode, setMode] = useState<"light" | "dark">("light")
  return (
    <div className="flex w-56 flex-col gap-3 rounded-[18px] surface-1 p-3 corner-squircle">
      <SegmentedTabs
        aria-label="Gallery theme"
        value={mode}
        onValueChange={setMode}
        items={[
          { key: "light", label: "Light", icon: Sun },
          { key: "dark", label: "Dark", icon: Moon }
        ]}
      />
      <SegmentedTabs<Theme>
        variant="subtle"
        labels="active"
        aria-label="Theme"
        value={theme}
        onValueChange={setTheme}
        items={[
          { key: "light", label: "Light", icon: Sun },
          { key: "system", label: "System", icon: Monitor },
          { key: "dark", label: "Dark", icon: Moon }
        ]}
      />
    </div>
  )
}
