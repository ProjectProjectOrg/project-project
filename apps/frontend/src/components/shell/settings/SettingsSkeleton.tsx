import { SettingsGroup } from "@/components/shell/settings/SettingsGroup"

export function SettingsSkeleton({ rows = 1 }: Readonly<{ rows?: number }>) {
  return (
    <SettingsGroup>
      {Array.from({ length: rows }, (_, row) => (
        <div key={row} className="h-14 animate-pulse" />
      ))}
    </SettingsGroup>
  )
}
