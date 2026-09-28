import type { ReactNode } from "react"
import Animated, {
  type SharedValue,
  useAnimatedStyle
} from "react-native-reanimated"

export function Reveal({
  progress,
  children
}: Readonly<{ progress: SharedValue<number>; children: ReactNode }>) {
  const style = useAnimatedStyle(() => ({
    opacity: progress.value,
    transform: [{ translateY: (1 - progress.value) * 8 }]
  }))
  return <Animated.View style={style}>{children}</Animated.View>
}
