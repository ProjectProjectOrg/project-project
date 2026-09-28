import {
  type NativeStackNavigationProp,
  router,
  SplashScreen,
  Stack,
  useNavigation,
  usePreventRemove
} from "expo-router"
import { useHeaderHeight } from "expo-router/react-navigation"
import { useEffect, useMemo, useState } from "react"
import {
  Keyboard,
  type LayoutRectangle,
  useWindowDimensions,
  View
} from "react-native"
import { GestureDetector, usePanGesture } from "react-native-gesture-handler"
import Animated, {
  clamp,
  Easing,
  interpolate,
  useAnimatedStyle,
  useDerivedValue,
  useSharedValue,
  withDelay,
  withSpring,
  withTiming
} from "react-native-reanimated"
import { scheduleOnRN } from "react-native-worklets"

import { Dither } from "@/components/Dither"
import { KeyboardDock } from "@/components/KeyboardDock"
import { Logo } from "@/components/Logo"
import { Button } from "@/components/ui/button"
import { Text } from "@/components/ui/text"
import { copy } from "@/copy"
import { AddressFields, useAddressForm } from "@/onboarding/AddressForm"
import {
  aroundContent,
  bandContentInset,
  contentFalloff
} from "@/onboarding/DitherBand"

const logoSize = 96
const ease = Easing.bezier(0.22, 1, 0.36, 1)
// The spread starts softly, so the texture visibly grows out from the logo
// instead of landing all at once.
const spreadEase = Easing.bezier(0.45, 0, 0.2, 1)
// The logo is already on screen when it starts to rise, so it gathers speed
// from rest instead of jumping off at full speed: a critically damped
// spring, which settles without overshooting.
const lift = { duration: 1100, dampingRatio: 1 } as const

const dismissKeyboard = () => Keyboard.dismiss()

type Box = Readonly<{ x: number; y: number; width: number; height: number }>

const mix = (from: Box, to: Box, t: number) => {
  "worklet"
  return {
    x: interpolate(t, [0, 1], [from.x, to.x]),
    y: interpolate(t, [0, 1], [from.y, to.y]),
    width: interpolate(t, [0, 1], [from.width, to.width]),
    height: interpolate(t, [0, 1], [from.height, to.height])
  }
}

// The welcome screen grows out of the native splash, which is the logo
// centred in the window on the dither-back ground. Its first frame is that
// splash: the logo in the splash's place and no texture. Then the dither
// spreads outward from around the logo, and just after, the logo rises to its
// place and the well opens up to hold the text, pushing the texture out to
// the edges. The text and the button come in last.
// "Get started" doesn't push a screen: the address step grows out of the
// welcome. The well opens up until the texture has drawn back into the band
// the later steps carry, the welcome's logo and text lift away, and the
// address step comes in after them. The button stays where it is and becomes
// Continue, then rides up with the keyboard. Back plays it in reverse.
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

  const header = useHeaderHeight()
  const [step, setStep] = useState<"welcome" | "address">("welcome")
  // The address step's content, which the well closes in around.
  const [addressHeight, setAddressHeight] = useState(0)
  const addressTop = header + bandContentInset
  const toAddress = useSharedValue(0)
  const { form, field } = useAddressForm(() =>
    router.push("/onboarding/confirm")
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
    const welcome =
      layout === undefined ? splash : mix(splash, layout.well, grow.value)
    return mix(
      welcome,
      aroundContent(width, addressTop, addressHeight),
      toAddress.value
    )
  })
  const falloff = useDerivedValue(() =>
    interpolate(toAddress.value, [0, 1], [80, contentFalloff])
  )
  // The welcome's pieces clear out over the first half of the change, and
  // the address step comes in over the second, so they never overlap.
  const away = useDerivedValue(() =>
    interpolate(toAddress.value, [0, 0.5], [0, 1], "clamp")
  )
  const arrive = useDerivedValue(() =>
    interpolate(toAddress.value, [0.4, 1], [0, 1], "clamp")
  )
  const logoStyle = useAnimatedStyle(() => ({
    opacity: 1 - away.value,
    transform: [
      {
        translateY:
          (layout === undefined ? 0 : layout.rise * grow.value) -
          24 * away.value
      }
    ]
  }))
  const textStyle = useAnimatedStyle(() => ({
    opacity: text.value * (1 - away.value),
    transform: [{ translateY: 8 * (1 - text.value) - 16 * away.value }]
  }))
  const addressStyle = useAnimatedStyle(() => ({
    opacity: arrive.value,
    transform: [{ translateY: 16 * (1 - arrive.value) }]
  }))

  const focusField = () => field.current?.focus()
  // The field focuses straight away, so the keyboard comes up with the
  // change instead of after it.
  const start = () => {
    setStep("address")
    focusField()
    toAddress.set(withTiming(1, { duration: 650, easing: ease }))
  }
  const backToWelcome = () => {
    Keyboard.dismiss()
    setStep("welcome")
    toAddress.set(withTiming(0, { duration: 550, easing: ease }))
  }
  // Back, from the header or the edge swipe, steps back to the welcome
  // instead of leaving the screen.
  usePreventRemove(step === "address", backToWelcome)
  // A pan from the left edge scrubs the change back with the finger, like
  // iOS's interactive back. Let go past a third of the way, or with a
  // flick, and it finishes back to the welcome; otherwise it settles back on
  // the address step.
  const edgeBack = usePanGesture({
    enabled: step === "address",
    hitSlop: { left: 0, width: 28 },
    activeOffsetX: 8,
    failOffsetY: [-24, 24],
    onActivate: () => {
      "worklet"
      scheduleOnRN(dismissKeyboard)
    },
    onUpdate: ({ translationX }) => {
      "worklet"
      toAddress.set(clamp(1 - translationX / width, 0, 1))
    },
    onDeactivate: ({ translationX, velocityX }) => {
      "worklet"
      if (translationX > width / 3 || velocityX > 600) {
        toAddress.set(withTiming(0, { duration: 350, easing: ease }))
        scheduleOnRN(setStep, "welcome")
      } else {
        toAddress.set(
          withTiming(1, { duration: 300, easing: ease }, (finished) => {
            if (finished === true) scheduleOnRN(focusField)
          })
        )
      }
    }
  })

  const navigation =
    useNavigation<
      NativeStackNavigationProp<Readonly<Record<string, undefined>>>
    >()
  // Coming back from the confirm step, the keyboard slides up again once
  // the pop has settled.
  useEffect(
    () =>
      navigation.addListener("transitionEnd", ({ data }) => {
        if (!data.closing && step === "address") field.current?.focus()
      }),
    [navigation, field, step]
  )
  const actionStyle = useAnimatedStyle(() => ({
    opacity: action.value,
    transform: [{ translateY: 12 * (1 - action.value) }]
  }))

  return (
    <GestureDetector gesture={edgeBack}>
      <View className="flex-1 bg-dither-back px-5 pt-safe pb-safe-offset-2">
        <Dither
          well={well}
          reveal={reveal}
          falloff={falloff}
          className="absolute inset-0"
        />
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
        <Animated.View
          pointerEvents={step === "address" ? "auto" : "none"}
          style={[
            { position: "absolute", left: 0, right: 0, top: addressTop },
            addressStyle
          ]}
          className="px-5"
          onLayout={({ nativeEvent }) =>
            setAddressHeight(nativeEvent.layout.height)
          }
        >
          <AddressFields form={form} field={field} />
        </Animated.View>
        <KeyboardDock>
          <Animated.View style={actionStyle}>
            {step === "welcome" ? (
              <Button label={copy.welcomeStart} onPress={start} />
            ) : (
              <Button
                label={copy.addressContinue}
                loading={form.checking}
                disabled={form.empty}
                onPress={() => void form.submit()}
              />
            )}
          </Animated.View>
        </KeyboardDock>
        {step === "address" ? (
          <Stack.Toolbar placement="left">
            <Stack.Toolbar.Button
              icon="chevron.left"
              accessibilityLabel={copy.back}
              onPress={backToWelcome}
            />
          </Stack.Toolbar>
        ) : null}
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
    </GestureDetector>
  )
}
