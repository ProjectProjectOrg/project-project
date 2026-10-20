import { useEffect, useState, type ComponentProps } from "react"

import {
  SEGMENTED_ITEM_CLASS,
  SegmentedTabs,
  type SegmentedItem
} from "@/components/SegmentedTabs"
import { useSettingsRow } from "@/components/settings/SettingsSection"
import { Input } from "@/components/ui/input"
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

  useEffect(() => setDraft(value), [value])

  const commit = () => {
    const trimmed = draft.trim()
    if ((trimmed.length === 0 && !allowEmpty) || trimmed === value) {
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
          setDraft(value)
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

/** A segmented choice labelled by its settings row. Picking the active
 *  option again is a no-op; `waiting` pulses the control while a save runs. */
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
