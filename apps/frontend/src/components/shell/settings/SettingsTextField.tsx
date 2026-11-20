import { Input } from "@pp/ui/input"
import { cn } from "@pp/ui/lib/utils"
import { SegmentedTabs, type SegmentedItem } from "@pp/ui/segmented-tabs"
import { Switch } from "@pp/ui/switch"
import { useRef, useState, type ComponentProps } from "react"

import { useSettingsRow } from "@/components/shell/settings/SettingsSection"

type SettingsTextFieldProps = Pick<
  ComponentProps<typeof Input>,
  "variant" | "size" | "aria-label"
> &
  Readonly<{
    value: string
    onCommit: (next: string) => void
    disabled?: boolean
    waiting?: boolean
    maxLength?: number
    placeholder?: string
    allowEmpty?: boolean
    className?: string
  }>

export function SettingsTextField({
  value,
  onCommit,
  disabled = false,
  waiting = false,
  maxLength,
  placeholder,
  allowEmpty = false,
  className,
  variant,
  size,
  "aria-label": ariaLabel
}: SettingsTextFieldProps) {
  const { labelId, descriptionId } = useSettingsRow()
  const [draft, setDraft] = useState(value)
  const [syncedValue, setSyncedValue] = useState(value)
  const cancelled = useRef(false)

  if (value !== syncedValue) {
    setSyncedValue(value)
    setDraft(value)
  }

  const commit = () => {
    const trimmed = draft.trim()
    const skip = cancelled.current
    cancelled.current = false
    if (skip || (trimmed.length === 0 && !allowEmpty) || trimmed === value) {
      setDraft(value)
      return
    }
    onCommit(trimmed)
  }

  return (
    <Input
      value={draft}
      variant={variant}
      size={size}
      onChange={(event) => setDraft(event.target.value)}
      onBlur={commit}
      onKeyDown={(event) => {
        if (event.key === "Enter") event.currentTarget.blur()
        if (event.key === "Escape") {
          cancelled.current = true
          event.currentTarget.blur()
        }
      }}
      disabled={disabled}
      maxLength={maxLength}
      placeholder={placeholder}
      aria-label={ariaLabel}
      aria-labelledby={ariaLabel === undefined ? labelId : undefined}
      aria-describedby={descriptionId}
      data-pending={waiting || undefined}
      className={cn("w-64", className)}
    />
  )
}

export function SettingsInput({
  className,
  ...props
}: ComponentProps<typeof Input>) {
  const { labelId, descriptionId } = useSettingsRow()
  return (
    <Input
      aria-labelledby={labelId}
      aria-describedby={descriptionId}
      className={cn("w-64", className)}
      {...props}
    />
  )
}

export function SettingsSwitch(props: ComponentProps<typeof Switch>) {
  const { labelId, descriptionId } = useSettingsRow()
  return (
    <Switch
      aria-labelledby={labelId}
      aria-describedby={descriptionId}
      {...props}
    />
  )
}

export function SettingsSegmented<K extends string>({
  items,
  value,
  onValueChange,
  waiting = false
}: Readonly<{
  items: ReadonlyArray<SegmentedItem<K>>
  value: K | null
  onValueChange: (next: K) => void
  waiting?: boolean
}>) {
  const { labelId } = useSettingsRow()
  return (
    <div
      role="group"
      aria-labelledby={labelId}
      data-pending={waiting || undefined}
    >
      <SegmentedTabs
        items={items}
        value={value}
        onValueChange={onValueChange}
      />
    </div>
  )
}
