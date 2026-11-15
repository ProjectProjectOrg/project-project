import { Monitor, Moon, Sun } from "@pp/ui/icons"
import { setThemeRevealOrigin } from "@pp/ui/lib/themeReveal"
import { SegmentedTabs } from "@pp/ui/segmented-tabs"
import type { MouseEvent } from "react"

import { useTheme, type ThemePreference } from "@/hooks/useTheme"
import { m } from "@/paraglide/messages"

const options: ReadonlyArray<{
  value: ThemePreference
  label: () => string
  icon: typeof Sun
}> = [
  { value: "light", label: m.theme_light, icon: Sun },
  { value: "system", label: m.theme_system, icon: Monitor },
  { value: "dark", label: m.theme_dark, icon: Moon }
]

export function ThemeSwitcher() {
  const { preference, setPreference } = useTheme()

  const handleClickCapture = (e: MouseEvent<HTMLDivElement>) =>
    setThemeRevealOrigin(e.clientX, e.clientY)

  return (
    <div onClickCapture={handleClickCapture}>
      <SegmentedTabs
        variant="subtle"
        aria-label={m.theme_switcher_aria_label()}
        labels="active"
        value={preference}
        onValueChange={setPreference}
        items={options.map((opt) => ({
          key: opt.value,
          label: opt.label(),
          icon: opt.icon
        }))}
      />
    </div>
  )
}
