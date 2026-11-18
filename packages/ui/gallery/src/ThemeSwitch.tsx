import { Monitor, Moon, Sun } from "@pp/ui/icons"
import { setThemeRevealOrigin } from "@pp/ui/lib/themeReveal"
import { SegmentedTabs } from "@pp/ui/segmented-tabs"

import {
  setThemePreference,
  useThemePreference,
  type ThemePreference
} from "./theme"

// The same switcher as the app's sidebar: the subtle variant, showing only
// the chosen option's label.
const ITEMS = [
  { key: "light", label: "Light", icon: Sun },
  { key: "system", label: "System", icon: Monitor },
  { key: "dark", label: "Dark", icon: Moon }
] as const

export function ThemeSwitch() {
  const preference = useThemePreference()
  return (
    <div
      onClickCapture={(event) =>
        setThemeRevealOrigin(event.clientX, event.clientY)
      }
    >
      <SegmentedTabs<ThemePreference>
        variant="subtle"
        labels="active"
        items={ITEMS}
        value={preference}
        onValueChange={setThemePreference}
        aria-label="Theme"
      />
    </div>
  )
}
