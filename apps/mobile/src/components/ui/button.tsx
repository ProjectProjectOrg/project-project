import {
  Button as NativeButton,
  HStack,
  Host,
  ProgressView,
  Text as NativeText
} from "@expo/ui/swift-ui"
import {
  buttonStyle,
  controlSize,
  disabled as nativeDisabled,
  font,
  foregroundStyle,
  frame
} from "@expo/ui/swift-ui/modifiers"
import { cva, type VariantProps } from "class-variance-authority"
import {
  ActivityIndicator,
  type PressableProps,
  Text,
  View
} from "react-native"
import { useCSSVariable } from "uniwind"

import { PressScale } from "./press-scale"

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
  Omit<PressableProps, "children" | "onPress"> &
    VariantProps<typeof buttonVariants> & {
      label: string
      loading?: boolean
      className?: string
      onPress?: () => void
    }
>

const nativeLabelSize = { md: 15, lg: 16 } as const

// The primary action is iOS's own Liquid Glass button, so it presses and
// refracts like the system's. The other variants stay flat, per DESIGN.md.
function GlassButton({
  label,
  loading,
  size,
  className,
  disabled,
  onPress
}: Readonly<{
  label: string
  loading: boolean
  size: "md" | "lg"
  className?: string
  disabled: boolean
  onPress?: () => void
}>) {
  const [foreground] = useCSSVariable(["--color-foreground"])
  return (
    <View className={className}>
      <Host matchContents={{ vertical: true }} style={{ width: "100%" }}>
        <NativeButton
          onPress={onPress}
          modifiers={[
            buttonStyle("glass"),
            controlSize(size === "md" ? "regular" : "large"),
            nativeDisabled(disabled || loading)
          ]}
        >
          <HStack modifiers={[frame({ maxWidth: Number.POSITIVE_INFINITY })]}>
            {loading ? (
              <ProgressView />
            ) : (
              <NativeText
                modifiers={[
                  font({ family: "Geist-Medium", size: nativeLabelSize[size] }),
                  foregroundStyle(String(foreground))
                ]}
              >
                {label}
              </NativeText>
            )}
          </HStack>
        </NativeButton>
      </Host>
    </View>
  )
}

export function Button({
  label,
  loading = false,
  variant,
  size,
  className,
  disabled,
  onPress,
  ...props
}: ButtonProps) {
  if (variant === undefined || variant === "primary")
    return (
      <GlassButton
        label={label}
        loading={loading}
        size={size ?? "lg"}
        className={className}
        disabled={disabled === true}
        onPress={onPress}
      />
    )
  return (
    <PressScale
      wrapperClassName={className}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{
        disabled: disabled === true || loading,
        busy: loading
      }}
      disabled={disabled === true || loading}
      className={buttonVariants({ variant, size })}
      onPress={onPress}
      {...props}
    >
      {loading ? (
        <ActivityIndicator colorClassName={spinnerVariants({ variant })} />
      ) : (
        <Text className={labelVariants({ variant, size })}>{label}</Text>
      )}
    </PressScale>
  )
}
