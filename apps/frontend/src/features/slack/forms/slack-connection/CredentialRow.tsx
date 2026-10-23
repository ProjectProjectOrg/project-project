import { SettingsRow } from "@/components/shell/settings/SettingsSection"
import { SettingsInput } from "@/components/shell/settings/SettingsTextField"

export function CredentialRow({
  name,
  label,
  hint,
  error,
  value,
  onChange,
  onBlur,
  busy,
  type = "password"
}: Readonly<{
  name: string
  label: string
  hint: string
  error: string | null
  value: string
  onChange: (value: string) => void
  onBlur: () => void
  busy: boolean
  type?: "password" | "text"
}>) {
  return (
    <SettingsRow label={label} description={hint} error={error}>
      <SettingsInput
        name={name}
        type={type}
        autoComplete="off"
        required
        disabled={busy}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        onBlur={onBlur}
        aria-invalid={error !== null}
        className="w-72"
      />
    </SettingsRow>
  )
}
