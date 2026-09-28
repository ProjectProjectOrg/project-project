import { useHeaderHeight } from "expo-router/react-navigation"
import { useEffect } from "react"
import { useWindowDimensions } from "react-native"
import {
  Easing,
  useDerivedValue,
  useSharedValue,
  withTiming
} from "react-native-reanimated"

import { Dither } from "@/components/Dither"

// How far below the header the page turns clear. The dither's 80 pt falloff
// thins the texture out over the last stretch above that, so the band needs
// this much depth to read as more than a sliver. The well reaches past the
// sides, so the band has no edges of its own.
const depth = 110
const overhang = 120
const spreadEase = Easing.bezier(0.45, 0, 0.2, 1)
// Screens start their content this far below the header, just inside the
// clear page.
export const bandContentInset = depth + 12

// The well that leaves only the band, in window coordinates.
export const bandWell = (width: number, height: number, header: number) => {
  "worklet"
  const y = header + depth
  return {
    x: -overhang,
    y,
    width: width + 2 * overhang,
    height: height - y + overhang
  }
}

// The onboarding steps carry the welcome screen's texture on as a band behind
// the header. It fills its screen, which sits on bg-dither-back, and grows up
// out of the page as the screen comes in, like the welcome screen's texture
// spreads out from its logo.
export function DitherBand() {
  const { width, height } = useWindowDimensions()
  const header = useHeaderHeight()
  const reveal = useSharedValue(0)
  const well = useDerivedValue(() => bandWell(width, height, header))
  useEffect(() => {
    reveal.set(withTiming(1, { duration: 900, easing: spreadEase }))
  }, [reveal])
  return <Dither well={well} reveal={reveal} className="absolute inset-0" />
}
