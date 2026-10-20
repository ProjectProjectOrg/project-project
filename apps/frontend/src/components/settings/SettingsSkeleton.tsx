import { SettingsGroup } from "@/components/settings/SettingsSection"

export function SettingsSkeleton({ rows = 1 }: Readonly<{ rows?: number }>) {
  return (
    <SettingsGroup>
      {Array.from({ length: rows }, (_, row) => (
        <div key={row} className="h-14 animate-pulse" />
      ))}
    </SettingsGroup>
  )
}
