import type { Ref } from "react"
import { TextInput, type TextInputProps, View } from "react-native"

import { cn } from "@/lib/cn"

import { Text } from "./text"

export type TextFieldProps = Readonly<
  TextInputProps & {
    label: string
    hint?: string | null
    error?: string | null
    mono?: boolean
    ref?: Ref<TextInput>
  }
>

export function TextField({
  label,
  hint,
  error,
  mono = false,
  className,
  ...props
}: TextFieldProps) {
  const invalid = error !== null && error !== undefined
  return (
    <View className="gap-2">
      <Text
        variant="label"
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
      >
        {label}
      </Text>
      <TextInput
        accessibilityLabel={label}
        accessibilityHint={error ?? hint ?? undefined}
        className={cn(
          "min-h-[50px] rounded-md border border-input bg-background px-3 py-3 text-[17px] text-foreground focus:border-ring",
          mono ? "font-mono" : "font-sans",
          invalid && "border-destructive focus:border-destructive",
          className
        )}
        placeholderTextColorClassName="accent-muted-foreground"
        cursorColorClassName="accent-foreground"
        selectionColorClassName="accent-foreground"
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
