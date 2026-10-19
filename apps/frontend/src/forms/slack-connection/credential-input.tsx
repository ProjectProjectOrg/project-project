import { Input } from "@/components/ui/input"

export function CredentialInput({
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
  const id = `slack-${name}`
  return (
    <div className="grid gap-1.5">
      <label htmlFor={id} className="text-sm font-medium">
        {label}
      </label>
      <p id={`${id}-hint`} className="text-xs text-muted-foreground">
        {hint}
      </p>
      <Input
        id={id}
        type={type}
        autoComplete="off"
        required
        disabled={busy}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        onBlur={onBlur}
        aria-invalid={error !== null}
        aria-describedby={error ? `${id}-hint ${id}-error` : `${id}-hint`}
      />
      {error ? (
        <p id={`${id}-error`} role="alert" className="text-xs text-destructive">
          {error}
        </p>
      ) : null}
    </div>
  )
}
