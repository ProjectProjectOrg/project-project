import type { ReactNode } from "react"
import { Pressable, View } from "react-native"

import { cn } from "@/lib/cn"

import { Text } from "./text"

export function ListSection({
  title,
  footer,
  children
}: Readonly<{ title?: string; footer?: string; children: ReactNode }>) {
  return (
    <View className="gap-2">
      {title === undefined ? null : (
        <Text variant="caption" className="px-4">
          {title}
        </Text>
      )}
      <View className="overflow-hidden rounded-lg border border-border bg-card">
        {children}
      </View>
      {footer === undefined ? null : (
        <Text variant="caption" className="px-4">
          {footer}
        </Text>
      )}
    </View>
  )
}

export function ListRow({
  title,
  subtitle,
  leading,
  trailing,
  destructive = false,
  first = false,
  onPress
}: Readonly<{
  title: string
  subtitle?: string
  leading?: ReactNode
  trailing?: ReactNode
  destructive?: boolean
  first?: boolean
  onPress?: () => void
}>) {
  const content = (
    <View
      className={cn(
        "min-h-12 flex-row items-center gap-3 px-4 py-3",
        !first && "border-t border-border"
      )}
    >
      {leading}
      <View className="flex-1 gap-0.5">
        <Text
          className={cn("text-base", destructive && "text-destructive")}
          numberOfLines={1}
        >
          {title}
        </Text>
        {subtitle === undefined ? null : (
          <Text variant="caption" numberOfLines={2}>
            {subtitle}
          </Text>
        )}
      </View>
      {trailing}
    </View>
  )
  return onPress === undefined ? (
    content
  ) : (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={
        subtitle === undefined ? title : `${title}, ${subtitle}`
      }
      onPress={onPress}
      className="active:bg-accent"
    >
      {content}
    </Pressable>
  )
}
