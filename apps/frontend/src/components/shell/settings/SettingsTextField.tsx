import { useEffect, useRef, useState, type ComponentProps } from "react"

import { useSettingsRow } from "@/components/shell/settings/SettingsSection"
import { Input } from "@/components/ui/input"
import {
  SEGMENTED_ITEM_CLASS,
  SegmentedTabs,
  type SegmentedItem
} from "@/components/ui/segmented-tabs"
import { Switch } from "@/components/ui/switch"
import { cn } from "@/lib/utils"

type SettingsTextFieldProps = Readonly<{
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
  className
}: SettingsTextFieldProps) {
  const { labelId, descriptionId } = useSettingsRow()
  const [draft, setDraft] = useState(value)
  const cancelled = useRef(false)

  useEffect(() => setDraft(value), [value])

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
      aria-labelledby={labelId}
      aria-describedby={descriptionId}
      className={cn("w-64 text-[13px]", waiting && "animate-pulse", className)}
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
      className={cn("w-64 text-[13px]", className)}
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
  value: K
  onValueChange: (next: K) => void
  waiting?: boolean
}>) {
  const { labelId } = useSettingsRow()
  return (
    <div role="group" aria-labelledby={labelId}>
      <SegmentedTabs
        items={items}
        isActive={(key) => key === value}
        className={cn(waiting && "animate-pulse")}
        renderItem={(item, content, { active }) => (
          <button
            type="button"
            aria-pressed={active}
            onClick={() => {
              if (!active) onValueChange(item.key)
            }}
            className={SEGMENTED_ITEM_CLASS(active)}
          >
            {content}
          </button>
        )}
      />
    </div>
  )
}
