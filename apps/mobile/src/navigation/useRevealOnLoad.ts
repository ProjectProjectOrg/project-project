import { useEffect } from "react"
import {
  Easing,
  useReducedMotion,
  useSharedValue,
  withTiming
} from "react-native-reanimated"

const ease = Easing.bezier(0.22, 1, 0.36, 1)

export const useRevealOnLoad = (loaded: boolean) => {
  const reduceMotion = useReducedMotion()
  const progress = useSharedValue(loaded ? 1 : 0)
  useEffect(() => {
    if (!loaded) return
    progress.set(
      reduceMotion ? 1 : withTiming(1, { duration: 500, easing: ease })
    )
  }, [loaded, progress, reduceMotion])
  return progress
}
