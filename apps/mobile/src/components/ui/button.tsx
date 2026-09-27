import { cva, type VariantProps } from "class-variance-authority"
import { useState } from "react"
import {
  ActivityIndicator,
  Animated,
  type GestureResponderEvent,
  Pressable,
  type PressableProps,
  Text
} from "react-native"

const buttonVariants = cva(
  "flex-row items-center justify-center gap-2 rounded-md disabled:opacity-50",
  {
    variants: {
      variant: {
        primary: "bg-foreground active:bg-foreground/80",
        secondary: "bg-accent active:bg-accent/80",
        tertiary: "border border-border active:bg-muted/60",
        ghost: "active:bg-muted/60",
        destructive: "bg-destructive active:bg-destructive/80"
      },
      size: {
        md: "min-h-11 px-4 py-2.5",
        lg: "min-h-[50px] px-5 py-3.5"
      }
    },
    defaultVariants: { variant: "primary", size: "lg" }
  }
)

const labelVariants = cva("text-center font-sans font-medium", {
  variants: {
    variant: {
      primary: "text-background",
      secondary: "text-foreground",
      tertiary: "text-foreground",
      ghost: "text-muted-foreground",
      destructive: "text-destructive-foreground"
    },
    size: {
      md: "text-[15px]",
      lg: "text-base"
    }
  },
  defaultVariants: { variant: "primary", size: "lg" }
})

const spinnerVariants = cva("", {
  variants: {
    variant: {
      primary: "accent-background",
      secondary: "accent-foreground",
      tertiary: "accent-foreground",
      ghost: "accent-muted-foreground",
      destructive: "accent-destructive-foreground"
    }
  },
  defaultVariants: { variant: "primary" }
})

export type ButtonProps = Readonly<
  Omit<PressableProps, "children"> &
    VariantProps<typeof buttonVariants> & {
      label: string
      loading?: boolean
      className?: string
    }
>

const pressDuration = { in: 100, out: 150 } as const

export function Button({
  label,
  loading = false,
  variant,
  size,
  className,
  disabled,
  onPressIn,
  onPressOut,
  ...props
}: ButtonProps) {
  const [scale] = useState(() => new Animated.Value(1))
  const pressTo = (toValue: number, duration: number) =>
    Animated.timing(scale, { toValue, duration, useNativeDriver: true }).start()

  return (
    <Animated.View className={className} style={{ transform: [{ scale }] }}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={label}
        accessibilityState={{
          disabled: disabled === true || loading,
          busy: loading
        }}
        disabled={disabled === true || loading}
        className={buttonVariants({ variant, size })}
        onPressIn={(event: GestureResponderEvent) => {
          pressTo(0.97, pressDuration.in)
          onPressIn?.(event)
        }}
        onPressOut={(event: GestureResponderEvent) => {
          pressTo(1, pressDuration.out)
          onPressOut?.(event)
        }}
        {...props}
      >
        {loading ? (
          <ActivityIndicator colorClassName={spinnerVariants({ variant })} />
        ) : (
          <Text className={labelVariants({ variant, size })}>{label}</Text>
        )}
      </Pressable>
    </Animated.View>
  )
}
