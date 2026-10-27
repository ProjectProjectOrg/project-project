import { Monitor, Moon, Sun } from "lucide-react"
import type { MouseEvent } from "react"

import { SegmentedTabs } from "@/components/ui/segmented-tabs"
import { useTheme, type ThemePreference } from "@/hooks/useTheme"
import { getThemeRevealRadius } from "@/lib/themeReveal"
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

  const handleClickCapture = (e: MouseEvent<HTMLDivElement>) => {
    const root = document.documentElement
    root.style.setProperty("--theme-clip-x", `${e.clientX}px`)
    root.style.setProperty("--theme-clip-y", `${e.clientY}px`)
    root.style.setProperty(
      "--theme-clip-radius",
      `${getThemeRevealRadius(
        e.clientX,
        e.clientY,
        window.innerWidth,
        window.innerHeight
      )}px`
    )
  }

  return (
    <div onClickCapture={handleClickCapture}>
      <SegmentedTabs
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
