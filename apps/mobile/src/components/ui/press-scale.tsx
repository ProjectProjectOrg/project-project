import { useState } from "react"
import {
  Animated,
  type GestureResponderEvent,
  Pressable,
  type PressableProps
} from "react-native"

const pressDuration = { in: 100, out: 150 } as const

export type PressScaleProps = Readonly<
  PressableProps & { wrapperClassName?: string }
>

export function PressScale({
  wrapperClassName,
  onPressIn,
  onPressOut,
  ...props
}: PressScaleProps) {
  const [scale] = useState(() => new Animated.Value(1))
  const pressTo = (toValue: number, duration: number) =>
    Animated.timing(scale, { toValue, duration, useNativeDriver: true }).start()

  return (
    <Animated.View
      className={wrapperClassName}
      style={{ transform: [{ scale }] }}
    >
      <Pressable
        onPressIn={(event: GestureResponderEvent) => {
          pressTo(0.97, pressDuration.in)
          onPressIn?.(event)
        }}
        onPressOut={(event: GestureResponderEvent) => {
          pressTo(1, pressDuration.out)
          onPressOut?.(event)
        }}
        {...props}
      />
    </Animated.View>
  )
}
