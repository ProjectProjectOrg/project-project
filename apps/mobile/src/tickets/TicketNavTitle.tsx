import { useHeaderHeight } from "expo-router/react-navigation"
import { type LayoutChangeEvent, useWindowDimensions } from "react-native"
import Animated, {
  Extrapolation,
  interpolate,
  type SharedValue,
  useAnimatedScrollHandler,
  useAnimatedStyle,
  useDerivedValue,
  useSharedValue
} from "react-native-reanimated"

import { Text } from "@/components/ui/text"

const backButtonSpace = 88
const riseDistance = 12

export const useCollapsingTitle = () => {
  const headerHeight = useHeaderHeight()
  const scrollY = useSharedValue(0)
  const titleTop = useSharedValue(0)
  const titleHeight = useSharedValue(0)
  const onScroll = useAnimatedScrollHandler((event) => {
    scrollY.set(event.contentOffset.y)
  })
  const onTitleLayout = ({ nativeEvent }: LayoutChangeEvent) => {
    titleTop.set(nativeEvent.layout.y)
    titleHeight.set(nativeEvent.layout.height)
  }
  const progress = useDerivedValue(() =>
    titleHeight.get() === 0
      ? 0
      : interpolate(
          scrollY.get() + headerHeight,
          [titleTop.get(), titleTop.get() + titleHeight.get()],
          [0, 1],
          Extrapolation.CLAMP
        )
  )
  const pageTitleStyle = useAnimatedStyle(() => ({
    opacity: 1 - progress.get()
  }))
  return { progress, onScroll, onTitleLayout, pageTitleStyle }
}

export function TicketNavTitle({
  ticketId,
  title,
  progress
}: Readonly<{
  ticketId: string
  title: string
  progress: SharedValue<number>
}>) {
  const { width } = useWindowDimensions()
  const style = useAnimatedStyle(() => ({
    opacity: progress.get(),
    transform: [{ translateY: (1 - progress.get()) * riseDistance }]
  }))
  return (
    <Animated.View style={[{ width: width - backButtonSpace }, style]}>
      <Text variant="caption" className="font-mono text-[11px] leading-[13px]">
        {ticketId}
      </Text>
      <Text
        className="text-[15px] leading-[19px] font-semibold"
        numberOfLines={1}
      >
        {title}
      </Text>
    </Animated.View>
  )
}
