import { Image, View } from "react-native"

import { Logo } from "@/components/Logo"
import { Text } from "@/components/ui/text"
import { hostOf } from "@/onboarding/address"

function ServerMark({ logo }: Readonly<{ logo: string | null }>) {
  return logo === null ? (
    <View className="size-16 items-center justify-center rounded-md border border-border">
      <Logo size={40} />
    </View>
  ) : (
    <Image
      source={{ uri: logo }}
      className="size-16 rounded-md border border-border"
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
