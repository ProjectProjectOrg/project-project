import { router, SplashScreen } from "expo-router"
import { useEffect, useMemo, useState } from "react"
import { type LayoutRectangle, useWindowDimensions, View } from "react-native"
import Animated, {
  Easing,
  interpolate,
  useAnimatedStyle,
  useDerivedValue,
  useSharedValue,
  withDelay,
  withSpring,
  withTiming
} from "react-native-reanimated"

import { Dither } from "@/components/Dither"
import { Logo } from "@/components/Logo"
import { Button } from "@/components/ui/button"
import { Text } from "@/components/ui/text"
import { copy } from "@/copy"

const logoSize = 96
const ease = Easing.bezier(0.22, 1, 0.36, 1)
// The spread starts softly, so the texture visibly grows out from the logo
// instead of landing all at once.
const spreadEase = Easing.bezier(0.45, 0, 0.2, 1)
// The logo is already on screen when it starts to rise, so it gathers speed
// from rest instead of jumping off at full speed: a critically damped
// spring, which settles without overshooting.
const lift = { duration: 1100, dampingRatio: 1 } as const

// The welcome screen grows out of the native splash, which is the logo
// centred in the window on the dither-back ground. Its first frame is that
// splash: the logo in the splash's place and no texture. Then the dither
// spreads outward from around the logo, and just after, the logo rises to its
// place and the well opens up to hold the text, pushing the texture out to
// the edges. The text and the button come in last.
// Reanimated skips the timings when the system reduces motion.
export default function Welcome() {
  const { width, height } = useWindowDimensions()
  // The logo is placed from the window's size, which is known on the first
  // render, so it starts exactly on the splash's logo. Only where it rises to
  // depends on the layout: an empty slot in the content that it moves into.
  const splash = {
    x: (width - logoSize) / 2,
    y: (height - logoSize) / 2,
    width: logoSize,
    height: logoSize
  }
  // The content's layout is relative to the centring wrapper and the slot's
  // to the content, so the offsets are added up to the screen's coordinates.
  const [wrapper, setWrapper] = useState<LayoutRectangle>()
  const [content, setContent] = useState<LayoutRectangle>()
  const [slot, setSlot] = useState<LayoutRectangle>()
  const layout = useMemo(
    () =>
      wrapper === undefined || content === undefined || slot === undefined
        ? undefined
        : {
            well: {
              ...content,
              x: wrapper.x + content.x,
              y: wrapper.y + content.y
            },
            rise: wrapper.y + content.y + slot.y - splash.y
          },
    [wrapper, content, slot, splash.y]
  )

  const reveal = useSharedValue(0)
  const grow = useSharedValue(0)
  const text = useSharedValue(0)
  const action = useSharedValue(0)
  const ready = layout !== undefined
  useEffect(() => {
    if (!ready) return undefined
    // A frame later, so the screen under the splash is drawn before it goes.
    const frame = requestAnimationFrame(() => {
      SplashScreen.hide()
      reveal.set(withTiming(1, { duration: 1100, easing: spreadEase }))
      grow.set(withDelay(350, withSpring(1, lift)))
      text.set(withDelay(750, withTiming(1, { duration: 500, easing: ease })))
      action.set(withDelay(900, withTiming(1, { duration: 500, easing: ease })))
    })
    return () => cancelAnimationFrame(frame)
  }, [ready, reveal, grow, text, action])

  const well = useDerivedValue(() => {
    if (layout === undefined) return splash
    const t = grow.value
    return {
      x: interpolate(t, [0, 1], [splash.x, layout.well.x]),
      y: interpolate(t, [0, 1], [splash.y, layout.well.y]),
      width: interpolate(t, [0, 1], [splash.width, layout.well.width]),
      height: interpolate(t, [0, 1], [splash.height, layout.well.height])
    }
  })
  const logoStyle = useAnimatedStyle(() => ({
    transform: [
      { translateY: layout === undefined ? 0 : layout.rise * grow.value }
    ]
  }))
  const textStyle = useAnimatedStyle(() => ({
    opacity: text.value,
    transform: [{ translateY: 8 * (1 - text.value) }]
  }))
  const actionStyle = useAnimatedStyle(() => ({
    opacity: action.value,
    transform: [{ translateY: 12 * (1 - action.value) }]
  }))

  return (
    <View className="flex-1 bg-dither-back px-5 pt-safe pb-safe-offset-2">
      <Dither well={well} reveal={reveal} className="absolute inset-0" />
      <View
        className="flex-1 items-center justify-center"
        onLayout={({ nativeEvent }) => setWrapper(nativeEvent.layout)}
      >
        <View
          className="items-center px-6 py-8"
          onLayout={({ nativeEvent }) => setContent(nativeEvent.layout)}
        >
          <View
            style={{ width: logoSize, height: logoSize }}
            onLayout={({ nativeEvent }) => setSlot(nativeEvent.layout)}
          />
          <Animated.View style={textStyle}>
            <View className="mt-8 items-center">
              <Text variant="muted">{copy.welcomeEyebrow}</Text>
              <Text variant="display">{copy.appName}</Text>
              <Text variant="muted" className="mt-2 text-center">
                {copy.welcomeBody}
              </Text>
            </View>
          </Animated.View>
        </View>
      </View>
      <Animated.View style={actionStyle}>
        <Button
          label={copy.welcomeStart}
          onPress={() => router.push("/onboarding/address")}
        />
      </Animated.View>
      <Animated.View
        pointerEvents="none"
        style={[
          { position: "absolute", left: 0, right: 0, top: splash.y },
          logoStyle
        ]}
        className="items-center"
      >
        <Logo size={logoSize} />
      </Animated.View>
    </View>
  )
}
