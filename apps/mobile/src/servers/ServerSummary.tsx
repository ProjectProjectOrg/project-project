import { Image, View } from "react-native"

import { Logo } from "@/components/Logo"
import { Text } from "@/components/ui/text"
import { hostOf } from "@/onboarding/address"

export function ServerMark({
  logo,
  small = false
}: Readonly<{ logo: string | null; small?: boolean }>) {
  const frame = small
    ? "size-9 rounded-sm border border-border"
    : "size-16 rounded-md border border-border"
  return logo === null ? (
    <View className={`${frame} items-center justify-center`}>
      <Logo size={small ? 22 : 40} />
    </View>
  ) : (
    <Image
      source={{ uri: logo }}
      className={frame}
      accessibilityIgnoresInvertColors
    />
  )
}

export function ServerSummary({
  lead,
  name,
  logo,
  origin,
  detail
}: Readonly<{
  lead: string
  name: string
  logo: string | null
  origin: string
  detail?: string
}>) {
  return (
    <View className="gap-4">
      <Text variant="muted">{lead}</Text>
      <ServerMark logo={logo} />
      <View className="gap-1">
        <Text variant="headline">{name}</Text>
        <Text variant="mono" className="text-muted-foreground">
          {hostOf(origin)}
        </Text>
        {detail === undefined ? null : <Text variant="caption">{detail}</Text>}
      </View>
    </View>
  )
}
