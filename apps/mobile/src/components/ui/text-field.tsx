import { type Ref, useId } from "react"
import { TextInput, type TextInputProps, View } from "react-native"

import { cn } from "@/lib/cn"

import { Text } from "./text"

export type TextFieldProps = TextInputProps &
  Readonly<{
    label: string
    hint?: string | null
    error?: string | null
    mono?: boolean
    ref?: Ref<TextInput>
  }>

export function TextField({
  label,
  hint,
  error,
  mono = false,
  className,
  ...props
}: TextFieldProps) {
  const labelId = useId()
  const invalid = error !== null && error !== undefined
  return (
    <View className="gap-2">
      <Text variant="label" nativeID={labelId}>
        {label}
      </Text>
      <TextInput
        accessibilityLabelledBy={labelId}
        accessibilityHint={error ?? hint ?? undefined}
        className={cn(
          "h-[50px] rounded-md border border-input bg-background px-3 text-[17px] text-foreground focus:border-ring",
          mono ? "font-mono" : "font-sans",
          invalid && "border-destructive focus:border-destructive",
          className
        )}
        placeholderTextColorClassName="accent-muted-foreground"
        cursorColorClassName="accent-foreground"
        selectionColorClassName="accent-foreground/30"
        {...props}
      />
      {invalid ? (
        <Text variant="error" accessibilityLiveRegion="polite">
          {error}
        </Text>
      ) : hint === null || hint === undefined ? null : (
        <Text variant="caption">{hint}</Text>
      )}
    </View>
  )
}
