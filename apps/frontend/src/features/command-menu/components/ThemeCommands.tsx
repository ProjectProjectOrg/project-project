import { Monitor, Moon, Sun } from "lucide-react"

import { CommandMenuItem, CommandMenuCheck } from "@/components/ui/command-menu"
import { useTheme, type ThemePreference } from "@/hooks/useTheme"
import { m } from "@/paraglide/messages"

import type { CommandPageProps } from "../lib/commandPages"
import { CommandFrame } from "./CommandFrame"

const THEMES: ReadonlyArray<
  Readonly<{ value: ThemePreference; label: () => string; icon: typeof Sun }>
> = [
  { value: "light", label: m.theme_light, icon: Sun },
  { value: "dark", label: m.theme_dark, icon: Moon },
  { value: "system", label: m.theme_system, icon: Monitor }
]

export function ThemeCommands({ chip, onBack, env }: CommandPageProps) {
  const { preference, setPreference } = useTheme()
  return (
    <CommandFrame
      chip={chip}
      placeholder={m.chrome_command_menu_theme_placeholder()}
      onBack={onBack}
      items={THEMES.map((theme) => ({
        value: theme.value,
        label: theme.label(),
        icon: theme.icon
      }))}
      onSelect={(item) => {
        const theme = THEMES.find((candidate) => candidate.value === item.value)
        if (theme) setPreference(theme.value)
        env.close()
      }}
      renderItem={(item) => {
        const theme = THEMES.find((candidate) => candidate.value === item.value)
        if (theme === undefined) return null
        return (
          <CommandMenuItem value={item.value}>
            <span className="min-w-0 flex-1 truncate">{item.label}</span>
            {preference === theme.value && <CommandMenuCheck />}
          </CommandMenuItem>
        )
      }}
    />
  )
}
