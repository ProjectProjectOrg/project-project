import { router } from "expo-router"
import { useMemo, useState } from "react"
import { type LayoutRectangle, View } from "react-native"

import { Dither } from "@/components/Dither"
import { Logo } from "@/components/Logo"
import { Button } from "@/components/ui/button"
import { Text } from "@/components/ui/text"
import { copy } from "@/copy"

export default function Welcome() {
  // The well is in the screen's coordinates, and the content's layout is
  // relative to the centring wrapper, so both offsets are added.
  const [wrapper, setWrapper] = useState<LayoutRectangle>()
  const [content, setContent] = useState<LayoutRectangle>()
  const well = useMemo(
    () =>
      wrapper === undefined || content === undefined
        ? undefined
        : { ...content, x: wrapper.x + content.x, y: wrapper.y + content.y },
    [wrapper, content]
  )
  return (
    <View className="flex-1 bg-dither-back px-5 pt-safe pb-safe-offset-2">
      <Dither well={well} className="absolute inset-0" />
      <View
        className="flex-1 items-center justify-center"
        onLayout={({ nativeEvent }) => setWrapper(nativeEvent.layout)}
      >
        <View
          className="items-center px-6 py-8"
          onLayout={({ nativeEvent }) => setContent(nativeEvent.layout)}
        >
          <Logo size={96} />
          <Text variant="muted" className="mt-8">
            {copy.welcomeEyebrow}
          </Text>
          <Text variant="display">{copy.appName}</Text>
          <Text variant="muted" className="mt-2 text-center">
            {copy.welcomeBody}
          </Text>
        </View>
      </View>
      <Button
        label={copy.welcomeStart}
        onPress={() => router.push("/onboarding/address")}
      />
    </View>
  )
}
