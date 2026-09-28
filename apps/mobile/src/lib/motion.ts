import { Easing } from "react-native-reanimated"

export const standardEase = Easing.bezier(0.22, 1, 0.36, 1)

export const transitions = {
  fade: { duration: 150, easing: standardEase },
  layout: { duration: 220, easing: standardEase },
  morph: { duration: 260, easing: standardEase },
  pop: { duration: 180, easing: standardEase },
  presence: { duration: 180, easing: standardEase }
} as const
